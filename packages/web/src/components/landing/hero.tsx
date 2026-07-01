'use client';

import { Button } from '@/components/ui/button';
import { ArrowRight, ChefHat, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex items-center justify-center gap-2 mb-8"
          >
            <ChefHat className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              Petra AI
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-6xl lg:text-7xl"
          >
            Your Intelligent{' '}
            <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              Kitchen Assistant
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300"
          >
            Discover personalized recipes, plan your meals, and manage your pantry 
            with AI-powered assistance. Make cooking easier, healthier, and more enjoyable.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-10 flex items-center justify-center gap-4"
          >
            <Button asChild size="lg" className="group">
              <Link href="/auth/register">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            
            <Button asChild variant="outline" size="lg">
              <Link href="/demo">
                Try Demo
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400"
          >
            <Sparkles className="h-4 w-4" />
            <span>No credit card required • Free forever plan available</span>
          </motion.div>
        </div>

        {/* Hero Image/Animation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-16 sm:mt-24"
        >
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-blue-600/20 blur-3xl"></div>
            <div className="relative rounded-2xl bg-white/10 dark:bg-gray-900/10 backdrop-blur-sm border border-white/20 dark:border-gray-800/20 p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Chat Preview */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-primary rounded-full"></div>
                    <span className="text-sm font-medium">Chat with Petra</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="bg-gray-100 dark:bg-gray-700 rounded p-2">
                      What can I make with chicken and rice?
                    </div>
                    <div className="bg-primary/10 rounded p-2">
                      I found 12 delicious recipes! How about chicken fried rice or a hearty chicken and rice casserole?
                    </div>
                  </div>
                </div>

                {/* Recipe Card Preview */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                  <div className="aspect-video bg-gradient-to-br from-orange-200 to-red-200 dark:from-orange-800 dark:to-red-800 rounded mb-3"></div>
                  <h4 className="font-medium text-sm mb-1">Chicken Fried Rice</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">25 min • Easy • 4 servings</p>
                </div>

                {/* Pantry Preview */}
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                  <h4 className="font-medium text-sm mb-3">Your Pantry</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span>Chicken Breast</span>
                      <span className="text-green-600">2 lbs</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Rice</span>
                      <span className="text-yellow-600">1 cup</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Eggs</span>
                      <span className="text-red-600">2 left</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
