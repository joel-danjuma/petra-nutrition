'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, ChefHat } from 'lucide-react';
import Link from 'next/link';

export function CTA() {
  return (
    <section className="py-20 sm:py-32">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary to-blue-600 px-8 py-16 sm:px-16 sm:py-24"
        >
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-full h-full">
              <ChefHat className="absolute top-8 left-8 w-16 h-16 text-white/20" />
              <Sparkles className="absolute top-16 right-16 w-12 h-12 text-white/20" />
              <ChefHat className="absolute bottom-16 left-16 w-12 h-12 text-white/20" />
              <Sparkles className="absolute bottom-8 right-8 w-16 h-16 text-white/20" />
            </div>
          </div>

          <div className="relative text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              viewport={{ once: true }}
              className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
            >
              Ready to transform your kitchen?
            </motion.h2>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              viewport={{ once: true }}
              className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/90"
            >
              Join thousands of home cooks who have revolutionized their cooking experience with AI-powered assistance. 
              Start your culinary journey today.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              viewport={{ once: true }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button
                asChild
                size="lg"
                className="bg-white text-primary hover:bg-white/90 group"
              >
                <Link href="/auth/register">
                  Start Free Today
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/demo">
                  See How It Works
                </Link>
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              viewport={{ once: true }}
              className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-white/80"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm">Free forever plan</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm">No credit card required</span>
              </div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm">Cancel anytime</span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-8">
            Trusted by home cooks worldwide
          </p>
          
          {/* Mock logos - in a real app these would be actual partner/user logos */}
          <div className="flex items-center justify-center gap-8 opacity-60">
            <div className="text-2xl font-bold text-gray-400">FoodNetwork</div>
            <div className="text-2xl font-bold text-gray-400">AllRecipes</div>
            <div className="text-2xl font-bold text-gray-400">Bon Appétit</div>
            <div className="text-2xl font-bold text-gray-400">Epicurious</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
