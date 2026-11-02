import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { UserPlus, User, Lock, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const setupSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
  role: z.enum(['ADMIN', 'EMPLOYEE']),
  adminUsername: z.string().optional(),
  adminPassword: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SetupFormValues = z.infer<typeof setupSchema>;

export const Setup: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      role: 'EMPLOYEE',
    },
  });

  const onSubmit = async (data: SetupFormValues) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const response = await api.post('/auth/setup', {
        username: data.username,
        fullName: data.fullName,
        password: data.password,
        role: data.role,
        adminUsername: data.adminUsername?.trim() || undefined,
        adminPassword: data.adminPassword || undefined,
      });

      if (response.data.success) {
        const { user, accessToken } = response.data.data;
        if (accessToken) {
          login(user, accessToken);
          navigate('/');
          return;
        }

        reset({ role: 'EMPLOYEE' });
        setSuccessMsg('Account created. The user can sign in from the login page.');
      }
    } catch (err: any) {
      const apiError = err.response?.data?.error?.message || err.response?.data?.message;
      if (apiError) {
        setErrorMsg(apiError);
      } else {
        setErrorMsg('An unexpected error occurred during setup. Please try again.');
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 flex items-center justify-center relative overflow-hidden font-sans">

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-lg p-8 relative z-10"
      >
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-lg">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="h-16 w-16 bg-brand-600 rounded-2xl flex items-center justify-center mb-6">
              <ShieldCheck className="text-white w-8 h-8" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Account Setup</h1>
            <p className="text-slate-600 mt-2 text-sm leading-relaxed">
              Create the first administrator, or create another account with an existing admin password.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-4"
              >
                <p className="text-sm text-emerald-700 leading-relaxed">{successMsg}</p>
              </motion.div>
            )}

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 leading-relaxed">{errorMsg}</p>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800 ml-1">Role</label>
              <select
                {...register('role')}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Existing admin approval</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Required when an administrator account already exists.
              </p>

              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-800 ml-1">Admin username</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-slate-500" />
                    </div>
                    <input
                      {...register('adminUsername')}
                      type="text"
                      autoComplete="username"
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all placeholder:text-slate-500"
                      placeholder="admin"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-800 ml-1">Admin password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-500" />
                    </div>
                    <input
                      {...register('adminPassword')}
                      type="password"
                      autoComplete="current-password"
                      className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all placeholder:text-slate-500"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800 ml-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <UserPlus className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  {...register('fullName')}
                  type="text"
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all placeholder:text-slate-500"
                  placeholder="e.g. John Doe"
                />
              </div>
              {errors.fullName && <p className="text-sm text-red-700 ml-1 mt-1">{errors.fullName.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800 ml-1">Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  {...register('username')}
                  type="text"
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all placeholder:text-slate-500"
                  placeholder="admin"
                />
              </div>
              {errors.username && <p className="text-sm text-red-700 ml-1 mt-1">{errors.username.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  {...register('password')}
                  type="password"
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all placeholder:text-slate-500"
                  placeholder="••••••••"
                />
              </div>
              {errors.password && <p className="text-sm text-red-700 ml-1 mt-1">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-800 ml-1">Confirm Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  {...register('confirmPassword')}
                  type="password"
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-lg pl-11 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all placeholder:text-slate-500"
                  placeholder="••••••••"
                />
              </div>
              {errors.confirmPassword && <p className="text-sm text-red-700 ml-1 mt-1">{errors.confirmPassword.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-3.5 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2 mt-6"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Create Account</span>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-brand-700 transition-colors hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};
