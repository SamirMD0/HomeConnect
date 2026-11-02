import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Lock, User, Loader2, AlertCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandArt } from '../components/ui/BrandArt';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const FIELD =
  'w-full rounded-lg border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMsg(null);
    try {
      const response = await api.post('/auth/login', {
        username: data.username,
        password: data.password,
      });

      if (response.data.success) {
        const { user, accessToken } = response.data.data;
        login(user, accessToken);
        navigate('/');
      }
    } catch (err: any) {
      const apiError = err.response?.data?.error?.message || err.response?.data?.message;
      if (apiError) {
        setErrorMsg(apiError);
      } else {
        setErrorMsg('Invalid username or password. Please try again.');
      }
    }
  };

  return (
    <div className="grid min-h-screen w-full bg-white font-sans lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col justify-between gap-8 p-6 sm:p-10">
        <img src="/homeconnects-logo.webp" alt="Home Connects" className="h-16 w-16 object-contain" />

        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-[1.75rem] font-bold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600">Welcome back to Home Connects.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5">
            {errorMsg && (
              <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-red-700">{errorMsg}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="login-username" className="text-sm font-semibold text-slate-800">Username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input id="login-username" {...register('username')} type="text" autoComplete="username" className={FIELD} placeholder="Enter your username" />
              </div>
              {errors.username && <p className="text-sm text-red-700">{errors.username.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-sm font-semibold text-slate-800">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" aria-hidden="true" />
                <input id="login-password" {...register('password')} type="password" autoComplete="current-password" className={FIELD} placeholder="••••••••" />
              </div>
              {errors.password && <p className="text-sm text-red-700">{errors.password.message}</p>}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input {...register('rememberMe')} type="checkbox" className="h-4 w-4 rounded" />
              Remember me
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
            Need another account?{' '}
            <Link to="/setup" className="font-semibold text-brand-700 hover:underline">
              Create account
            </Link>
          </p>
        </div>

        <p className="text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Home Connects. All rights reserved.
        </p>
      </div>

      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-12 text-white lg:flex">
        <div className="max-w-md">
          <p className="text-[2.25rem] font-bold leading-tight tracking-tight">
            Your whole shop, connected.
          </p>
          <p className="mt-4 text-base leading-relaxed text-brand-100">
            Sales, customer debts, suppliers, inventory and service jobs, all in one place.
          </p>
        </div>
        <BrandArt className="w-full max-w-2xl self-end text-brand-200" />
      </div>
    </div>
  );
};
