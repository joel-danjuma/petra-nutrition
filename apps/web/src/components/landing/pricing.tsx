'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, Crown, Zap } from 'lucide-react';
import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for getting started with AI-powered cooking assistance.',
    features: [
      'AI Chat Assistant',
      'Recipe Discovery & Search',
      'Personal Profile & Preferences',
      'Basic Recipe Generation',
      'Cross-platform Access',
      'Community Recipes',
    ],
    notIncluded: [
      'Multi-day Meal Planning',
      'Pantry Management',
      'Barcode Scanning',
      'Smart Shopping Lists',
      'Advanced AI Features',
      'Priority Support',
    ],
    cta: 'Get Started Free',
    href: '/auth/register',
    popular: false,
  },
  {
    name: 'Premium',
    price: '$9.99',
    period: 'per month',
    description: 'Everything you need for complete kitchen management and meal planning.',
    features: [
      'Everything in Free',
      'Multi-day Meal Planning (up to 14 days)',
      'Advanced Pantry Management',
      'Barcode & Image Scanning',
      'Smart Shopping Lists',
      'Nutrition Tracking & Analysis',
      'Recipe Collections & Templates',
      'Priority AI Processing',
      'Export & Sharing Features',
      'Priority Email Support',
    ],
    notIncluded: [],
    cta: 'Start Premium Trial',
    href: '/auth/register?plan=premium',
    popular: true,
  },
];

export function Pricing() {
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
            Simple, transparent pricing
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            viewport={{ once: true }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300"
          >
            Start free and upgrade when you're ready. No hidden fees, cancel anytime.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              viewport={{ once: true }}
              className={`relative h-full p-8 bg-white dark:bg-gray-800 rounded-2xl border-2 transition-all duration-300 ${
                plan.popular
                  ? 'border-primary shadow-lg scale-105'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary/50'
              }`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="flex items-center gap-1 px-4 py-2 bg-gradient-to-r from-primary to-blue-600 text-white rounded-full text-sm font-medium">
                    <Crown className="w-4 h-4" />
                    Most Popular
                  </div>
                </div>
              )}

              {/* Header */}
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {plan.name}
                </h3>
                <div className="flex items-baseline justify-center gap-2 mb-4">
                  <span className="text-4xl font-bold text-gray-900 dark:text-white">
                    {plan.price}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {plan.period}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  {plan.description}
                </p>
              </div>

              {/* Features */}
              <div className="space-y-4 mb-8">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                  </div>
                ))}
                
                {plan.notIncluded.map((feature) => (
                  <div key={feature} className="flex items-center gap-3 opacity-50">
                    <div className="w-5 h-5 flex-shrink-0" />
                    <span className="text-gray-500 dark:text-gray-500 line-through">{feature}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <Button
                asChild
                className={`w-full ${
                  plan.popular
                    ? 'bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90'
                    : ''
                }`}
                variant={plan.popular ? 'default' : 'outline'}
                size="lg"
              >
                <Link href={plan.href}>
                  {plan.cta}
                  {plan.popular && <Zap className="w-4 h-4 ml-2" />}
                </Link>
              </Button>

              {plan.name === 'Premium' && (
                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                  14-day free trial • No credit card required
                </p>
              )}
            </motion.div>
          ))}
        </div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            Frequently Asked Questions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto text-left">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Can I cancel anytime?
              </h4>
              <p className="text-gray-600 dark:text-gray-400">
                Yes, you can cancel your subscription at any time. You'll continue to have access until the end of your billing period.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                What's included in the free trial?
              </h4>
              <p className="text-gray-600 dark:text-gray-400">
                The 14-day free trial includes full access to all Premium features. No credit card required to start.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Do you offer refunds?
              </h4>
              <p className="text-gray-600 dark:text-gray-400">
                We offer a 30-day money-back guarantee. If you're not satisfied, we'll refund your payment.
              </p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Is my data secure?
              </h4>
              <p className="text-gray-600 dark:text-gray-400">
                Absolutely. We use enterprise-grade encryption and never share your personal data with third parties.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
