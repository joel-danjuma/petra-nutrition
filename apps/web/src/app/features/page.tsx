import Link from 'next/link';
import { ChefHat, MessageSquare, BookOpen, Package, Calendar, ShoppingCart, Camera, Zap, Shield, Smartphone } from 'lucide-react';

const features = [
  {
    icon: MessageSquare,
    title: 'AI Chat Assistant',
    description: 'Chat with our intelligent AI to get personalized recipe suggestions, cooking tips, and meal ideas based on your preferences and what\'s in your pantry.',
    free: true,
  },
  {
    icon: BookOpen,
    title: 'Recipe Discovery',
    description: 'Search thousands of recipes or generate custom ones with AI. Filter by cuisine, dietary restrictions, cooking time, and difficulty level.',
    free: true,
  },
  {
    icon: Package,
    title: 'Pantry Management',
    description: 'Track everything in your pantry, fridge, and freezer. Get alerts for expiring items and low stock levels. Never waste food again.',
    free: false,
  },
  {
    icon: Camera,
    title: 'Barcode & Image Scanning',
    description: 'Add items to your pantry instantly by scanning barcodes or taking photos. Our AI identifies food items from images in seconds.',
    free: false,
  },
  {
    icon: Calendar,
    title: 'Meal Planning',
    description: 'Generate AI-powered weekly meal plans tailored to your dietary goals, preferences, and available ingredients. Free users get single-day plans.',
    free: false,
  },
  {
    icon: ShoppingCart,
    title: 'Smart Shopping Lists',
    description: 'Automatically generate shopping lists from your meal plans. Items already in your pantry are automatically excluded to avoid duplicates.',
    free: false,
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-secondary">
      {/* Nav */}
      <nav className="bg-background border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-primary" />
            <span className="text-lg font-medium text-foreground">Petra AI</span>
          </Link>
          <div className="flex gap-4">
            <Link href="/auth/login" className="text-sm text-muted-foreground active:text-foreground">Sign In</Link>
            <Link href="/auth/register" className="text-sm px-4 py-1.5 bg-primary text-white rounded-lg active:bg-primary transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-medium text-foreground mb-4">Everything you need in your kitchen</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Petra AI combines smart recipe discovery, pantry tracking, and AI-powered meal planning into one beautifully designed app.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {features.map(feature => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="bg-background rounded-2xl border border-border p-6">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-medium text-foreground">{feature.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${feature.free ? 'bg-secondary text-primary' : 'bg-warning text-foreground'}`}>
                    {feature.free ? 'Free' : 'Premium'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            { icon: Zap, title: 'Blazing Fast AI', desc: 'Responses powered by Llama 3 via GroqAPI — the fastest AI inference available.' },
            { icon: Shield, title: 'Private & Secure', desc: 'Your data is encrypted in transit and at rest. We never sell your information.' },
            { icon: Smartphone, title: 'Web & Mobile', desc: 'Access Petra from any browser or download our native iOS and Android apps.' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="text-center p-6">
                <Icon className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-medium text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <Link href="/auth/register" className="inline-block px-8 py-3.5 bg-primary text-white rounded-xl font-medium active:bg-primary transition-colors text-lg">
            Get started for free
          </Link>
          <p className="text-sm text-muted-foreground mt-3">No credit card required</p>
        </div>
      </div>
    </main>
  );
}
