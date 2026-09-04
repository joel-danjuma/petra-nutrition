'use client';

import { motion } from 'framer-motion';
import { MessageCircle, Search, Calendar, ShoppingCart } from 'lucide-react';

const steps = [
  {
    icon: MessageCircle,
    title: 'Chat with Petra',
    description: 'Tell Petra about your preferences, dietary restrictions, and what you have in your pantry.',
    step: '01',
  },
  {
    icon: Search,
    title: 'Discover Recipes',
    description: 'Get personalized recipe suggestions based on your ingredients and preferences.',
    step: '02',
  },
  {
    icon: Calendar,
    title: 'Plan Your Meals',
    description: 'Create weekly meal plans with nutritional balance and variety in mind.',
    step: '03',
  },
  {
    icon: ShoppingCart,
    title: 'Shop Smart',
    description: 'Generate shopping lists that know what you already have and what you need.',
    step: '04',
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 sm:py-32 bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl lg:text-5xl"
          >
            How it works
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            viewport={{ once: true }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300"
          >
            Get started with Petra in four simple steps. From conversation to cooking, 
            we make the entire process seamless and intelligent.
          </motion.p>
        </div>

        <div className="relative">
          {/* Connection Lines */}
          <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/20 via-primary to-primary/20 -translate-y-1/2 z-0" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative z-10">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="text-center"
              >
                {/* Step Number */}
                <div className="relative mb-6">
                  <div className="mx-auto w-16 h-16 bg-white dark:bg-gray-800 border-4 border-primary rounded-full flex items-center justify-center text-primary font-bold text-lg shadow-lg">
                    {step.step}
                  </div>
                </div>

                {/* Icon */}
                <div className="mb-4">
                  <div className="mx-auto w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                    <step.icon className="w-6 h-6" />
                  </div>
                </div>

                {/* Content */}
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                  {step.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors cursor-pointer">
            Ready to get started? It takes less than 2 minutes →
          </div>
        </motion.div>
      </div>
    </section>
  );
}
