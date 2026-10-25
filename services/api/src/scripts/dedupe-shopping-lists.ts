/**
 * Merge duplicate items on existing shopping lists.
 *
 * Lists written before `shopping-merge.ts` can hold the same thing several
 * times ("Milk 800 ml", "Milk 700 g", "Milk 2 cup"). New writes no longer do
 * that; this folds the old ones into one row each, using the same rules.
 *
 *   pnpm --filter @petra/api run db:dedupe-lists            # dry run: report only
 *   pnpm --filter @petra/api run db:dedupe-lists -- --apply # write the changes
 *
 * Within a group the first row (by name) survives and absorbs the others;
 * the others are deleted. A group stays ticked only if every row in it was.
 */
import { prisma } from '../database';
import { combine, lineKey } from '../services/shopping-merge';

const apply = process.argv.includes('--apply');

async function main() {
  const lists = await prisma.shoppingList.findMany({
    include: { items: { orderBy: [{ name: 'asc' }, { id: 'asc' }] } },
  });

  let merged = 0;
  let removed = 0;

  for (const list of lists) {
    const groups = new Map<string, typeof list.items>();
    for (const item of list.items) {
      const key = lineKey(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const [keep, ...rest] = group;
      const combined = combine(group);

      console.log(
        `${list.name}: ${group.map(i => `${i.name} ${i.quantity} ${i.unit}`).join(' + ')}` +
          ` → ${combined.name} ${combined.quantity} ${combined.unit}`
      );
      merged += 1;
      removed += rest.length;

      if (apply) {
        await prisma.$transaction([
          prisma.shoppingListItem.update({
            where: { id: keep.id },
            data: {
              quantity: combined.quantity,
              unit: combined.unit,
              recipeName: combined.recipeName,
              notes: combined.notes,
              isCompleted: combined.isCompleted,
            },
          }),
          prisma.shoppingListItem.deleteMany({
            where: { id: { in: rest.map(i => i.id) } },
          }),
        ]);
      }
    }
  }

  console.log(
    `\n${merged} item${merged === 1 ? '' : 's'} with duplicates across ${lists.length} lists; ` +
      `${removed} duplicate row${removed === 1 ? '' : 's'} ${apply ? 'removed' : 'would be removed'}.` +
      (apply
        ? ''
        : '\nDry run — nothing was changed. Re-run with --apply to merge them.')
  );
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
