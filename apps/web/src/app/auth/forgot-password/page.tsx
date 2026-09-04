'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChefHat, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        throw new Error(data.error?.message || 'Failed to send reset email');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <ChefHat className="h-8 w-8 text-primary" />
            <span className="text-2xl font-medium text-foreground">
              Petra AI
            </span>
          </Link>
          <h1 className="text-2xl font-medium text-foreground">Reset your password</h1>
          <p className="text-muted-foreground mt-1">
            {sent ? "Check your email for a reset link" : "Enter your email and we'll send you a link to reset your password"}
          </p>
        </div>

        <div className="bg-background rounded-2xl border border-border p-8">
          {sent ? (
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">
                We sent a password reset link to <strong>{email}</strong>. Check your inbox and follow the instructions.
              </p>
              <Button asChild className="w-full mt-6">
                <Link href="/auth/login">Back to Login</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent bg-background text-foreground"
                    placeholder="Enter your email"
                  />
                </div>
              </div>
              <Button type="submit" disabled={isLoading} className="w-full" size="lg">
                {isLoading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          )}
        </div>

        <div className="text-center mt-6">
          <Link href="/auth/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground active:text-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
