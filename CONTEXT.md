# Domain terms

The words this codebase uses for its core ideas, so code, tests and reviews
mean the same thing by them.

**Caller context** — Everything the agent is told about the person asking: who
they are, their tier, their allergies, diets and health goals, and (for Premium)
what is in their pantry. It is built from the stored profile, and a request can
only add to it, never take anything away.

**Chat turn** — One user message and the assistant's reply to it, from the
moment the message is sent to the moment the reply is stored. A turn that fails
part-way stores nothing.

**Ingredient identity** — Whether two ingredient names refer to the same thing
in the kitchen: "apples" and "apple" do, "olive oil" and "sesame oil" do not,
and "tinned tomatoes" is not "tomatoes". Preparation words like "chopped" do not
change identity; form words like "dried" or "ground" do.

**Staple** — An ingredient any kitchen is assumed to have already, such as salt,
olive oil or dried oregano. A staple is never counted as missing and never put
on a shopping list.

**Coverage** — Whether something in the pantry satisfies an ingredient a recipe
asks for. "Butter" in the pantry covers "unsalted butter" in a recipe; "garlic
powder" does not cover "garlic".
