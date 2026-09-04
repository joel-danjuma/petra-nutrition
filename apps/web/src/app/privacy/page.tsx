import Link from 'next/link';
import { ChefHat } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <ChefHat className="h-6 w-6 text-green-600" />
            <span className="text-lg font-bold text-gray-900 dark:text-white">Petra AI</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-16 prose prose-gray dark:prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Last updated: September 7, 2025</p>

        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly, including:</p>
        <ul>
          <li>Account information (name, email, password)</li>
          <li>Profile data (health stats, dietary preferences)</li>
          <li>Pantry items and meal plan data you create</li>
          <li>Chat messages sent to our AI assistant</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide and personalize the Service</li>
          <li>Process your subscription and payments</li>
          <li>Send transactional emails (receipts, password resets)</li>
          <li>Improve our AI models and features</li>
        </ul>

        <h2>3. Data Storage & Security</h2>
        <p>Your data is stored on secure servers and encrypted in transit using TLS. Sensitive data (passwords, health information) is encrypted at rest. We retain your data as long as your account is active.</p>

        <h2>4. Third-Party Services</h2>
        <p>We use the following third-party services:</p>
        <ul>
          <li><strong>GroqAPI</strong> — AI chat processing (Llama 3)</li>
          <li><strong>Google AI</strong> — Image recognition (Gemini Pro Vision)</li>
          <li><strong>OpenFoodFacts</strong> — Barcode product lookup</li>
        </ul>

        <h2>5. Your Rights</h2>
        <p>You have the right to access, correct, or delete your personal data at any time. You can delete your account from your Profile settings or by contacting us.</p>

        <h2>6. Cookies</h2>
        <p>We use cookies for authentication sessions. We do not use tracking or advertising cookies.</p>

        <h2>7. Children's Privacy</h2>
        <p>The Service is not directed to children under 13. We do not knowingly collect information from children under 13.</p>

        <h2>8. Contact</h2>
        <p>Questions about privacy? Contact us at <a href="mailto:privacy@petra.ai">privacy@petra.ai</a>.</p>
      </div>
    </main>
  );
}
