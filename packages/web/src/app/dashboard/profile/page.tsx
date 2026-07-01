'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@petra/shared';
import { User, Crown, Camera, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Halal', 'Kosher', 'Low-Sodium', 'Low-Fat'];
const HEALTH_GOALS = ['WEIGHT_LOSS', 'WEIGHT_GAIN', 'MUSCLE_GAIN', 'MAINTENANCE', 'HEART_HEALTH', 'DIABETES_MANAGEMENT'];
const ACTIVITY_LEVELS = ['SEDENTARY', 'LIGHTLY_ACTIVE', 'MODERATELY_ACTIVE', 'VERY_ACTIVE', 'EXTREMELY_ACTIVE'];

export default function ProfilePage() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    firstName: '', lastName: '',
    profile: { age: '', height: '', weight: '', activityLevel: '', dietaryRestrictions: [] as string[], healthGoals: [] as string[], cuisinePreferences: [] as string[] },
  });
  const [isSaving, setIsSaving] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        profile: {
          age: (user as any).profile?.age || '',
          height: (user as any).profile?.height || '',
          weight: (user as any).profile?.weight || '',
          activityLevel: (user as any).profile?.activityLevel || '',
          dietaryRestrictions: (user as any).profile?.dietaryRestrictions || [],
          healthGoals: (user as any).profile?.healthGoals || [],
          cuisinePreferences: (user as any).profile?.cuisinePreferences || [],
        },
      });
    }
    loadSubscription();
  }, [user]);

  const loadSubscription = async () => {
    try {
      const res = await fetch(`${API_URL}/subscription/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setSubscription(data.data);
    } catch {}
  };

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      const body = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        profile: {
          ...formData.profile,
          age: formData.profile.age ? parseInt(String(formData.profile.age)) : undefined,
          height: formData.profile.height ? parseFloat(String(formData.profile.height)) : undefined,
          weight: formData.profile.weight ? parseFloat(String(formData.profile.weight)) : undefined,
          activityLevel: formData.profile.activityLevel || undefined,
        },
      };
      const res = await fetch(`${API_URL}/users/profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) toast.success('Profile saved');
      else throw new Error(data.error?.message);
    } catch (e: any) {
      toast.error(e.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const res = await fetch(`${API_URL}/users/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (data.success) toast.success('Avatar updated');
    } catch {
      toast.error('Failed to upload avatar');
    }
  };

  const toggleArrayValue = (field: 'dietaryRestrictions' | 'healthGoals' | 'cuisinePreferences', value: string) => {
    setFormData(prev => {
      const arr = prev.profile[field] as string[];
      const updated = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, profile: { ...prev.profile, [field]: updated } };
    });
  };

  const upgradeToPremium = async () => {
    setIsUpgrading(true);
    try {
      const res = await fetch(`${API_URL}/subscription/upgrade`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSubscription(data.data);
        toast.success('Upgraded to Premium!');
        window.location.reload();
      }
    } catch {
      toast.error('Failed to upgrade subscription');
    } finally {
      setIsUpgrading(false);
    }
  };

  const isPremium = subscription?.isPremium;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>

      {/* Avatar & Name */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Account Info</h2>
        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-xl font-bold">
              {user?.firstName?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center hover:bg-green-700 transition-colors"
            >
              <Camera className="h-3 w-3" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{user?.firstName} {user?.lastName}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">First name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={e => setFormData(p => ({ ...p, firstName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Last name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={e => setFormData(p => ({ ...p, lastName: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Health Stats */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Health Stats</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: 'Age', key: 'age', placeholder: 'years', type: 'number' },
            { label: 'Height (cm)', key: 'height', placeholder: 'cm', type: 'number' },
            { label: 'Weight (kg)', key: 'weight', placeholder: 'kg', type: 'number' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{field.label}</label>
              <input
                type={field.type}
                placeholder={field.placeholder}
                value={(formData.profile as any)[field.key]}
                onChange={e => setFormData(p => ({ ...p, profile: { ...p.profile, [field.key]: e.target.value } }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Activity Level</label>
          <select
            value={formData.profile.activityLevel}
            onChange={e => setFormData(p => ({ ...p, profile: { ...p.profile, activityLevel: e.target.value } }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-green-500"
          >
            <option value="">Select activity level</option>
            {ACTIVITY_LEVELS.map(l => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {/* Dietary Preferences */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Dietary Preferences</h2>
        <div className="flex flex-wrap gap-2 mb-5">
          {DIETARY_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => toggleArrayValue('dietaryRestrictions', opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                formData.profile.dietaryRestrictions.includes(opt)
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-green-400'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Health Goals</h3>
        <div className="flex flex-wrap gap-2">
          {HEALTH_GOALS.map(goal => (
            <button
              key={goal}
              onClick={() => toggleArrayValue('healthGoals', goal)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                formData.profile.healthGoals.includes(goal)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:border-blue-400'
              }`}
            >
              {goal.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Subscription */}
      <div id="subscription" className={`rounded-2xl border p-6 ${isPremium ? 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className={`h-5 w-5 ${isPremium ? 'text-amber-500' : 'text-gray-400'}`} />
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {isPremium ? 'Premium Plan' : 'Free Plan'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isPremium ? 'All features unlocked' : 'Upgrade to unlock pantry, meal plans, and shopping lists'}
              </p>
            </div>
          </div>
          {!isPremium && (
            <Button onClick={upgradeToPremium} disabled={isUpgrading} className="gap-2 bg-amber-600 hover:bg-amber-700">
              {isUpgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
              Upgrade
            </Button>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={saveProfile} disabled={isSaving} className="gap-2 min-w-32">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? 'Saving...' : 'Save Profile'}
        </Button>
      </div>
    </div>
  );
}
