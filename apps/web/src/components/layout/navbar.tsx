'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@petra/shared';
import { Button } from '@/components/ui/button';
import { ChefHat, Menu, X } from 'lucide-react';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <nav className="sticky top-0 z-50 bg-background/80 border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-8 w-8 text-primary" />
            <span className="text-xl font-medium text-foreground">
              Petra AI
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <div className="flex items-center gap-6">
              <Link
                href="/features"
                className="text-muted-foreground active:text-primary transition-colors"
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="text-muted-foreground active:text-primary transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="/about"
                className="text-muted-foreground active:text-primary transition-colors"
              >
                About
              </Link>
            </div>

            <div className="flex items-center gap-4">
              {/* Auth Buttons */}
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <Button asChild>
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                  <Button variant="outline" onClick={logout}>
                    Sign Out
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button variant="outline" asChild>
                    <Link href="/auth/login">Sign In</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/auth/register">Get Started</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              className="h-9 w-9"
            >
              {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col gap-4">
              <Link
                href="/features"
                className="text-muted-foreground active:text-primary transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Features
              </Link>
              <Link
                href="/pricing"
                className="text-muted-foreground active:text-primary transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Pricing
              </Link>
              <Link
                href="/about"
                className="text-muted-foreground active:text-primary transition-colors"
                onClick={() => setIsOpen(false)}
              >
                About
              </Link>

              <div className="pt-4 border-t border-border">
                {isAuthenticated ? (
                  <div className="flex flex-col gap-3">
                    <Button asChild className="w-full">
                      <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                        Dashboard
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        logout();
                        setIsOpen(false);
                      }}
                      className="w-full"
                    >
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <Button variant="outline" asChild className="w-full">
                      <Link href="/auth/login" onClick={() => setIsOpen(false)}>
                        Sign In
                      </Link>
                    </Button>
                    <Button asChild className="w-full">
                      <Link href="/auth/register" onClick={() => setIsOpen(false)}>
                        Get Started
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
