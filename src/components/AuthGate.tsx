import React, { useState } from 'react';
import { Brand } from './Brand';
import { ThemeSwitch } from '../context/ThemeContext';
import { useFleet } from '../context/FleetContext';
import type { AccountMode } from '../types/fleet';
import { firebaseConfigured } from '../lib/firebase';
export function AuthGate() {
  const { completePortalSignUpOrLogin, resetPassword } = useFleet();
  const [mode, setMode] = useState<AccountMode>('Individual');
  const [action, setAction] = useState<'signup' | 'login' | 'reset' | 'member'>('signup');
  const [fullName, setName] = useState(''); const [org, setOrg] = useState('');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'reset') {
        await resetPassword(email);
        setNotice('If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.');
      } else await completePortalSignUpOrLogin({ authAction: action === 'member' ? 'org_member_login' : action, accountMode: mode, fullName, organizationName: org, email, passwordOrPin: password, whatsappNumber: '' });
    } catch (e: any) {
      const code = e?.code || '';
      setError(code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found') ? 'Email or password is incorrect.' : code.includes('email-already-in-use') ? 'An account already exists with this email. Log in or reset your password.' : code.includes('too-many-requests') ? 'Too many attempts. Please try again later.' : e?.message || 'Please try again.');
    } finally { setBusy(false); }
  }
  function change(a: typeof action) { setAction(a); setError(''); setNotice(''); setPassword(''); }
  const input = 'auth-input w-full rounded-xl border px-4 py-3 outline-none';
  return <main className="auth-page min-h-screen px-5 py-10 grid place-items-center">
    <div className="w-full max-w-md"><div className="auth-toolbar"><Brand /><ThemeSwitch /></div>
      <div className="mb-8"><p className="auth-eyebrow">VEHICLES · EARNINGS · PEACE OF MIND</p><h1 className="text-3xl font-bold mt-3">Your work. Your logbook.</h1><p className="text-slate-400 mt-3">A private workspace for your vehicles, daily earnings and expenses. New accounts start empty.</p></div>
      <section className="auth-card rounded-2xl border p-6 shadow-xl">
        <h2 className="text-xl font-semibold mb-5">{action === 'signup' ? 'Create your account' : action === 'login' ? 'Welcome back' : action === 'member' ? 'Team member sign in' : 'Reset your password'}</h2>
        {action !== 'reset' && action !== 'member' && <div className="auth-segments flex rounded-xl p-1 mb-5" aria-label="Account type">{(['Individual','Organization'] as AccountMode[]).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`flex-1 py-3 rounded-lg text-sm font-semibold ${mode === m ? 'auth-selected' : 'text-slate-600'}`}>{m}</button>)}</div>}
        <form onSubmit={submit} className="space-y-4">
          {action === 'signup' && <><label className="block text-sm">Full name<input required maxLength={100} autoComplete="name" className={input + ' mt-2'} value={fullName} onChange={e => setName(e.target.value)}/></label>{mode === 'Organization' && <label className="block text-sm">Organization name<input required maxLength={120} autoComplete="organization" className={input + ' mt-2'} value={org} onChange={e => setOrg(e.target.value)}/></label>}</>}
          <label className="block text-sm">Email address<input required type="email" autoComplete="email" className={input + ' mt-2'} value={email} onChange={e => setEmail(e.target.value)}/></label>
          {action !== 'reset' && <label className="block text-sm">{action === 'member' ? 'Access PIN' : 'Password'}<input required type="password" minLength={action === 'signup' ? 8 : 1} autoComplete={action === 'signup' ? 'new-password' : 'current-password'} className={input + ' mt-2'} value={password} onChange={e => setPassword(e.target.value)}/>{action === 'signup' && <span className="block text-xs text-slate-400 mt-2">At least 8 characters. Use a unique password.</span>}{action === 'member' && <span className="block text-xs text-slate-400 mt-2">Use the email and access PIN your organization owner set for you.</span>}</label>}
          {error && <p role="alert" className="text-sm text-red-300 break-words">{error}</p>}{notice && <p role="status" className="text-sm text-teal-300">{notice}</p>}
          {!firebaseConfigured && <p role="alert" className="text-amber-300 text-sm">Account setup is not complete yet. No demo account or data will be opened.</p>}
          <button disabled={busy || !firebaseConfigured} className="auth-submit w-full rounded-xl font-bold py-3 disabled:opacity-50">{busy ? 'Please wait...' : action === 'signup' ? 'Create account' : action === 'login' ? 'Log in' : action === 'member' ? 'Sign in as team member' : 'Send reset link'}</button>
        </form>
        <div className="mt-5 space-y-3 text-sm text-center">{action !== 'login' && <button className="text-teal-300 block w-full" onClick={() => change('login')}>Already have an account? Log in</button>}{action !== 'member' && <button className="text-teal-300 block w-full" onClick={() => change('member')}>Team member? Sign in with your PIN</button>}{action !== 'signup' && <button className="text-teal-300 block w-full" onClick={() => change('signup')}>Create a new account</button>}{action !== 'reset' && action !== 'member' && <button className="text-slate-600 block w-full" onClick={() => change('reset')}>Forgot password?</button>}</div>
      </section><p className="text-xs text-slate-500 mt-5 text-center">Your saved data stays with your account. Other users cannot access it.</p>
    </div>
  </main>;
}
