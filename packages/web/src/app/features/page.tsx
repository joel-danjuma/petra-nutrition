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
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Nav */}
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-green-600" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">Petra AI</span>
          </Link>
          <div className="flex gap-4">
            <Link href="/auth/login" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Sign In</Link>
            <Link href="/auth/register" className="text-sm px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Get Started</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Everything you need in your kitchen</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Petra AI combines smart recipe discovery, pantry tracking, and AI-powered meal planning into one beautifully designed app.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {features.map(feature => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">{feature.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${feature.free ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {feature.free ? 'Free' : 'Premium'}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{feature.description}</p>
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
                <Icon className="h-8 w-8 text-green-600 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
              </div>
            );
          })}
        </div>

        <div className="text-center">
          <Link href="/auth/register" className="inline-block px-8 py-3.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors text-lg">
            Get started for free
          </Link>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No credit card required</p>
        </div>
      </div>
    </main>
  );
}
