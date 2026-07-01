'use client';

import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

const testimonials = [
  {
    name: 'Sarah Johnson',
    role: 'Busy Mom of 3',
    content: 'Petra has completely transformed our meal planning. I save hours each week and my kids actually eat what I cook now!',
    rating: 5,
    avatar: '/avatars/sarah.jpg',
  },
  {
    name: 'Marcus Chen',
    role: 'Health Enthusiast',
    content: 'The nutrition tracking and personalized recommendations help me stay on track with my fitness goals. Love the barcode scanning feature!',
    rating: 5,
    avatar: '/avatars/marcus.jpg',
  },
  {
    name: 'Emily Rodriguez',
    role: 'College Student',
    content: 'As a student on a budget, Petra helps me make the most of my groceries and discover new recipes with ingredients I already have.',
    rating: 5,
    avatar: '/avatars/emily.jpg',
  },
  {
    name: 'David Kim',
    role: 'Professional Chef',
    content: 'Even as a chef, I find Petra\'s AI suggestions inspiring. It\'s like having a sous chef that never gets tired of brainstorming.',
    rating: 5,
    avatar: '/avatars/david.jpg',
  },
  {
    name: 'Lisa Thompson',
    role: 'Food Blogger',
    content: 'The recipe generation feature is incredible. It helps me create unique content while ensuring nutritional balance for my readers.',
    rating: 5,
    avatar: '/avatars/lisa.jpg',
  },
  {
    name: 'James Wilson',
    role: 'Fitness Trainer',
    content: 'I recommend Petra to all my clients. The meal planning aligns perfectly with their fitness goals and dietary requirements.',
    rating: 5,
    avatar: '/avatars/james.jpg',
  },
];

export function Testimonials() {
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
            Loved by home cooks everywhere
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            viewport={{ once: true }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-gray-300"
          >
            Join thousands of users who have transformed their cooking experience with Petra AI.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="h-full p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow duration-300">
                {/* Quote Icon */}
                <div className="absolute top-4 right-4 opacity-20">
                  <Quote className="w-8 h-8 text-primary" />
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>

                {/* Content */}
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
                  "{testimonial.content}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {testimonial.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {testimonial.name}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8"
        >
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">10K+</div>
            <div className="text-gray-600 dark:text-gray-400">Active Users</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">50K+</div>
            <div className="text-gray-600 dark:text-gray-400">Recipes Generated</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">25K+</div>
            <div className="text-gray-600 dark:text-gray-400">Meal Plans Created</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 dark:text-white">4.9★</div>
            <div className="text-gray-600 dark:text-gray-400">User Rating</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
