'use client';

import { motion } from 'framer-motion';
import { 
  MessageCircle, 
  ChefHat, 
  User, 
  Calendar, 
  Package, 
  ShoppingCart,
  Smartphone,
  Shield,
  Zap
} from 'lucide-react';

const features = [
  {
    icon: MessageCircle,
    title: 'AI Chat Assistant',
    description: 'Chat with Petra to get personalized recipe suggestions, cooking tips, and meal planning advice.',
    tier: 'free',
  },
  {
    icon: ChefHat,
    title: 'Recipe Discovery',
    description: 'Find and generate recipes based on your ingredients, preferences, and dietary restrictions.',
    tier: 'free',
  },
  {
    icon: User,
    title: 'Personal Profiles',
    description: 'Set your dietary preferences, allergies, and health goals for personalized recommendations.',
    tier: 'free',
  },
  {
    icon: Calendar,
    title: 'Meal Planning',
    description: 'Create detailed meal plans with nutritional analysis. Multi-day plans available with premium.',
    tier: 'premium',
  },
  {
    icon: Package,
    title: 'Pantry Management',
    description: 'Track your inventory with barcode scanning and image recognition. Never run out of essentials.',
    tier: 'premium',
  },
  {
    icon: ShoppingCart,
    title: 'Smart Shopping Lists',
    description: 'Auto-generate shopping lists from meal plans, cross-referenced with your pantry inventory.',
    tier: 'premium',
  },
  {
    icon: Smartphone,
    title: 'Cross-Platform',
    description: 'Access your data seamlessly across web and mobile devices with real-time synchronization.',
    tier: 'free',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your data is encrypted and secure. We never share your personal information with third parties.',
    tier: 'free',
  },
  {
    icon: Zap,
    title: 'AI-Powered',
    description: 'Powered by advanced AI models for intelligent recipe generation and nutritional analysis.',
    tier: 'free',
  },
];

export function Features() {
  return (
    <section className="py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl lg:text-5xl"
          >
            Everything you need for
            <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              {' '}smart cooking
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            viewport={{ once: true }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300"
          >
            From AI-powered recipe discovery to intelligent pantry management, 
            Petra has all the tools you need to transform your cooking experience.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="relative group"
            >
              <div className="h-full p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-primary/50 transition-all duration-300 hover:shadow-lg">
                {/* Tier Badge */}
                <div className="absolute top-4 right-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    feature.tier === 'premium' 
                      ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white' 
                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                  }`}>
                    {feature.tier === 'premium' ? 'Premium' : 'Free'}
                  </span>
                </div>

                {/* Icon */}
                <div className="mb-4">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="w-6 h-6" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            Start with free features, upgrade when you're ready
          </div>
        </motion.div>
      </div>
    </section>
  );
}
