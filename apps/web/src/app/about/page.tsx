import Link from 'next/link';
import { ChefHat, Heart, Leaf, Users } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-secondary">
      <nav className="bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" />
            <span className="text-lg font-medium text-foreground">Petra AI</span>
          </Link>
          <Link href="/auth/register" className="text-sm px-4 py-1.5 bg-primary text-white rounded-lg active:bg-primary transition-colors">
            Get Started
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-16">
        <h1 className="text-4xl font-medium text-foreground mb-6">About Petra AI</h1>

        <p className="text-lg text-muted-foreground mb-8">
          Petra AI is a kitchen management platform that combines artificial intelligence with practical meal planning tools to help you eat better, waste less, and spend less time thinking about what to cook.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {[
            { icon: Heart, title: 'Our Mission', desc: 'To make healthy, home-cooked meals accessible to everyone by removing the friction from meal planning and grocery shopping.' },
            { icon: Leaf, title: 'Reduce Waste', desc: 'Our pantry-aware shopping lists and expiry tracking help households reduce food waste and save money.' },
            { icon: Users, title: 'For Everyone', desc: 'Whether you\'re a busy professional, a parent feeding a family, or someone starting their cooking journey, Petra adapts to you.' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="bg-background rounded-2xl border border-border p-6">
                <Icon className="h-8 w-8 text-primary mb-3" />
                <h2 className="font-medium text-foreground mb-2">{item.title}</h2>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="prose prose-gray max-w-none">
          <h2>Technology</h2>
          <p>
            Petra is built with modern, open-source technology. Our AI features use Meta's Llama 3 model via GroqAPI for blazing-fast chat responses, and Google's Gemini Pro Vision for food image recognition. The application is built on Next.js, React Native (Expo), Node.js, and PostgreSQL.
          </p>
          <h2>Contact</h2>
          <p>
            Have questions or feedback? We'd love to hear from you. Reach out at{' '}
            <a href="mailto:hello@petra.ai" className="text-primary active:underline">hello@petra.ai</a>
          </p>
        </div>
      </div>
    </main>
  );
}
