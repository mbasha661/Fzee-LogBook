/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Bell,
  Box,
  Building2,
  Car,
  CheckCircle2,
  ClipboardList,
  Database,
  FileBarChart,
  FolderSync,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Phone,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { FleetProvider, useFleet } from './context/FleetContext';
import { I18nProvider, LanguageSwitch } from './i18n';
import { AccountMode, NavigationTab, OrgMemberRole } from './types/fleet';
import { DashboardView } from './components/DashboardView';
import { VehiclesView } from './components/VehiclesView';
import { LogbookView } from './components/LogbookView';
import {
  DocumentsExpiryView,
  DriversView,
  EarningsExpensesView,
  GoogleDriveAndNotificationsView,
  MaintenanceView,
  ReportsView,
  SettingsAndSetupView,
  Vehicle3DInspectorView,
} from './components/DriversAndOpsViews';
import { getSupabaseEnvironmentStatus } from './lib/supabase';
import { useOnlineStatus, usePWAInstall } from './hooks/usePWAInstall';

const NAV_ITEMS: Array<{
  id: NavigationTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'logbook', label: '15-Col Daily Logbook', icon: ClipboardList },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'vehicles', label: 'Vehicles', icon: Car },
  { id: 'finance', label: 'Earnings & Expenses', icon: TrendingUp },
  { id: 'drivers', label: 'Drivers', icon: Users },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  { id: 'documents', label: 'Documents & Expiry', icon: ShieldCheck },
  { id: 'notifications', label: 'Expiry Alerts (Mail/WA)', icon: Bell },
  { id: 'viewer3d', label: '3D Vehicle Viewer', icon: Box },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'backup', label: 'Google Drive Backup', icon: FolderSync },
  { id: 'settings', label: 'Settings & Org Users', icon: Settings },
];

const FzeeLogShell: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isOnline = useOnlineStatus();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const {
    user,
    authReady,
    dataLoading,
    isDemoMode,
    setIsDemoMode,
    profile,
    organizationMembers,
    activeOrgMember,
    setActiveOrgMember,
    completePortalSignUpOrLogin,
    errorBanner,
    clearErrorBanner,
    signInWithGoogle,
    signOut,
  } = useFleet();

  // 15-Column Logbook Ledger is the default primary view
  const [activeTab, setActiveTab] = useState<NavigationTab>('logbook');
  const [selectedVehicleFilter, setSelectedVehicleFilter] =
    useState<string>('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Organization vs Individual Login & Sign-Up Portal States
  const [authPortalModalOpen, setAuthPortalModalOpen] = useState(false);
  const [selectedAccountMode, setSelectedAccountMode] =
    useState<AccountMode>('Organization');
  const [portalAuthTab, setPortalAuthTab] = useState<
    'login' | 'signup' | 'org_member_login'
  >('signup');
  const [portalFullName, setPortalFullName] = useState('');
  const [portalOrgName, setPortalOrgName] = useState(
    'FzeeLog Commercial Fleet Services'
  );
  const [portalEmail, setPortalEmail] = useState('');
  const [portalWhatsapp, setPortalWhatsapp] = useState('');
  const [portalRole, setPortalRole] = useState<OrgMemberRole>('OrgAdmin');
  const [portalPersonalName, setPortalPersonalName] = useState('');
  const [portalPin, setPortalPin] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [portalSubmitting, setPortalSubmitting] = useState(false);
  const [portalNotice, setPortalNotice] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);

  const supabaseStatus = getSupabaseEnvironmentStatus();

  const handleNavigate = (tab: NavigationTab, vehicleId?: string) => {
    if (vehicleId) {
      setSelectedVehicleFilter(vehicleId);
    } else if (tab === 'logbook') {
      setSelectedVehicleFilter('ALL');
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handlePortalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPortalSubmitting(true);
    setPortalNotice(null);
    setPortalError(null);
    try {
      await completePortalSignUpOrLogin({
        authAction: portalAuthTab,
        accountMode: selectedAccountMode,
        fullName: portalFullName.trim(),
        organizationName:
          selectedAccountMode === 'Organization'
            ? portalOrgName.trim() || 'FzeeLog Commercial Fleet Services'
            : portalPersonalName.trim() ||
              `${portalFullName.trim() || 'My'} Personal Logbook`,
        email: portalEmail.trim(),
        whatsappNumber: portalWhatsapp.trim(),
        passwordOrPin: portalPin.trim(),
        role: portalRole,
        memberId: selectedMemberId || organizationMembers[0]?.id,
      });
      const memberId = selectedMemberId || organizationMembers[0]?.id;
      const member = organizationMembers.find((m) => m.id === memberId);
      setPortalNotice(
        `Signed in (${selectedAccountMode} Mode). 15-Column Logbook Ledger & 10d/5d/1d Expiry Alerts (${
          member?.email || portalEmail || 'no email set'
        } / WhatsApp ${member?.whatsappNumber || portalWhatsapp || 'not set'}) are active.`
      );
      setAuthPortalModalOpen(false);
      setActiveTab('logbook');
    } catch (err) {
      setPortalError(
        err instanceof Error ? err.message : 'Sign-in failed. Please try again.'
      );
    } finally {
      setPortalSubmitting(false);
    }
  };

  // Protected Route Gate when neither signed in nor in explicit Demo Preview Mode
  if (authReady && !user && !isDemoMode) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col justify-between p-6 lg:p-10">
        {/* Top Bar Contract */}
        <header className="flex items-center justify-between gap-8 pb-5 border-b border-slate-800 max-w-6xl w-full mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
              FzeeLog
            </span>
            <span className="px-2.5 py-0.5 text-[11px] font-mono bg-teal-950 text-teal-300 border border-teal-700 rounded">
              15-Column Default Ledger · 10d/5d/1d Expiry Alerts
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-teal-400 rounded-lg hover:bg-teal-300 transition-colors whitespace-nowrap shrink-0"
            >
              Google OAuth Sign In
            </button>
          </div>
        </header>

        <main className="max-w-6xl w-full mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Value Proposition & Step 1 Usage Mode Question */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-teal-400 tracking-wide uppercase">
                Step 1 · Choose How You Use FzeeLog
              </p>
              <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                Are you setting up FzeeLog for an Organization or Individual Use?
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed">
                Select <strong>Organization Use</strong> for multi-user role login (Admin, Fleet Manager, Accountant, Dispatcher, Driver) or <strong>Individual Use</strong> for a single owner-operator. The <strong>15-Column Logbook Ledger</strong> loads by default and is fully customizable.
              </p>
            </div>

            {/* Initial Choice Cards: Organization vs Individual */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setSelectedAccountMode('Organization');
                  setPortalAuthTab('signup');
                }}
                className={`p-4 rounded-xl border text-left transition-all space-y-2 ${
                  selectedAccountMode === 'Organization'
                    ? 'bg-teal-950/70 border-teal-400 ring-2 ring-teal-400/30'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Building2 className="w-5 h-5 text-teal-400" />
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-teal-400/20 text-teal-300">
                    Multi-User Login
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">
                  Organization Use
                </h3>
                <p className="text-xs text-slate-300">
                  Multiple user logins (Admin, Manager, Accountant, Dispatcher), shared 15-column fleet ledger, and team audit trail.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedAccountMode('Individual');
                  if (portalAuthTab === 'org_member_login') {
                    setPortalAuthTab('signup');
                  }
                }}
                className={`p-4 rounded-xl border text-left transition-all space-y-2 ${
                  selectedAccountMode === 'Individual'
                    ? 'bg-teal-950/70 border-teal-400 ring-2 ring-teal-400/30'
                    : 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <UserCheck className="w-5 h-5 text-teal-400" />
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                    Single Owner
                  </span>
                </div>
                <h3 className="text-base font-bold text-white">
                  Individual Use
                </h3>
                <p className="text-xs text-slate-300">
                  Streamlined personal or single-owner vehicle logbook, expense tracker, and statutory expiry alerts.
                </p>
              </button>
            </div>

            <div className="p-4 bg-slate-800/90 border border-slate-700 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-teal-300">
                <Bell className="w-4 h-4" />
                <span>
                  Automated 10-Day, 5-Day &amp; 1-Day Statutory Expiry Alerts
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Monitors <strong>Insurance</strong>, <strong>Fitness Certificate (FC)</strong>, <strong>Permit</strong>, <strong>Driver Licence</strong>, and <strong>Pollution (PUC)</strong> expiries and dispatches alerts before <strong>10 days</strong>, <strong>5 days</strong>, and <strong>1 day</strong> to your Email (<span className="font-mono text-white">{portalEmail || 'you@example.com'}</span>) and WhatsApp (<span className="font-mono text-white">{portalWhatsapp || 'your number'}</span>).
              </p>
            </div>

            {errorBanner && (
              <div className="p-4 bg-red-950/80 border border-red-700 rounded-lg text-xs text-red-200">
                {errorBanner}
              </div>
            )}
          </div>

          {/* Right Column: Organization & Individual Login / Sign-Up Form */}
          <div className="lg:col-span-6 bg-slate-800/95 border border-slate-700 rounded-xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 pb-3">
              <div>
                <span className="text-[11px] font-mono uppercase text-teal-400">
                  {selectedAccountMode === 'Organization'
                    ? 'Organization Multi-User Portal'
                    : 'Individual Owner Portal'}
                </span>
                <h2 className="text-lg font-bold text-white">
                  {portalAuthTab === 'signup'
                    ? `Create ${selectedAccountMode} Account`
                    : portalAuthTab === 'login'
                    ? `${selectedAccountMode} Account Login`
                    : 'Organization Team Member Login'}
                </h2>
              </div>

              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setPortalAuthTab('signup')}
                  className={`px-2.5 py-1 rounded font-semibold ${
                    portalAuthTab === 'signup'
                      ? 'bg-teal-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
                <button
                  type="button"
                  onClick={() => setPortalAuthTab('login')}
                  className={`px-2.5 py-1 rounded font-semibold ${
                    portalAuthTab === 'login'
                      ? 'bg-teal-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Login
                </button>
                {selectedAccountMode === 'Organization' && (
                  <button
                    type="button"
                    onClick={() => setPortalAuthTab('org_member_login')}
                    className={`px-2.5 py-1 rounded font-semibold ${
                      portalAuthTab === 'org_member_login'
                        ? 'bg-teal-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Multi-User Login ({organizationMembers.length})
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handlePortalSubmit} className="space-y-3.5 text-xs">
              {portalAuthTab === 'org_member_login' &&
              selectedAccountMode === 'Organization' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Select Organization Team Member Login
                    </label>
                    <select
                      value={selectedMemberId || organizationMembers[0]?.id || ''}
                      onChange={(e) => {
                        const m = organizationMembers.find(
                          (item) => item.id === e.target.value
                        );
                        setSelectedMemberId(e.target.value);
                        if (m) {
                          setPortalFullName(m.fullName);
                          setPortalEmail(m.email);
                          setPortalWhatsapp(m.whatsappNumber);
                          setPortalRole(m.role);
                          setPortalPin('');
                        }
                      }}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-medium"
                    >
                      {organizationMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.fullName} — {m.role} ({m.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Operator Access PIN
                    </label>
                    <input
                      type="password"
                      required
                      value={portalPin}
                      onChange={(e) => setPortalPin(e.target.value)}
                      placeholder="4-16 digit PIN"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Your Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={portalFullName}
                        onChange={(e) => setPortalFullName(e.target.value)}
                        placeholder="Full name"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                      />
                    </div>

                    {selectedAccountMode === 'Organization' ? (
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">
                          Organization / Company Name
                        </label>
                        <input
                          type="text"
                          required
                          value={portalOrgName}
                          onChange={(e) => setPortalOrgName(e.target.value)}
                          placeholder="FzeeLog Commercial Fleet Services"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">
                          Personal Vehicle / Logbook Label
                        </label>
                        <input
                          type="text"
                          value={portalPersonalName}
                          onChange={(e) => setPortalPersonalName(e.target.value)}
                          placeholder="Personal Vehicle Logbook"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Alert E-Mail ID (Insurance/FC/Permit/DL/PUC)
                      </label>
                      <input
                        type="email"
                        required
                        value={portalEmail}
                        onChange={(e) => setPortalEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        WhatsApp Number (10d, 5d, 1d Expiry Alerts)
                      </label>
                      <input
                        type="tel"
                        required
                        value={portalWhatsapp}
                        onChange={(e) => setPortalWhatsapp(e.target.value)}
                        placeholder="9876543210"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedAccountMode === 'Organization' && (
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">
                          Organization User Role
                        </label>
                        <select
                          value={portalRole}
                          onChange={(e) =>
                            setPortalRole(e.target.value as OrgMemberRole)
                          }
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white"
                        >
                          <option value="OrgAdmin">OrgAdmin (Full Access)</option>
                          <option value="FleetManager">FleetManager</option>
                          <option value="Accountant">Accountant</option>
                          <option value="Dispatcher">Dispatcher</option>
                          <option value="DriverViewer">DriverViewer</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Password / Access PIN
                      </label>
                      <input
                        type="password"
                        required
                        value={portalPin}
                        onChange={(e) => setPortalPin(e.target.value)}
                        placeholder="4-16 digit PIN"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono"
                      />
                    </div>
                  </div>
                </>
              )}

              {portalError && (
                <div
                  role="alert"
                  className="px-3 py-2 text-xs font-medium text-red-200 bg-red-950/70 border border-red-800 rounded-lg"
                >
                  {portalError}
                </div>
              )}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  type="submit"
                  disabled={portalSubmitting}
                  className="flex-1 px-5 py-3 text-xs font-bold text-slate-950 bg-teal-400 rounded-lg hover:bg-teal-300 transition-colors flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  {portalSubmitting
                    ? 'Launching 15-Column Ledger...'
                    : portalAuthTab === 'signup'
                    ? `Complete ${selectedAccountMode} Sign Up & Open 15-Column Logbook`
                    : `Login (${selectedAccountMode}) & Open 15-Column Logbook`}
                </button>

                <button
                  type="button"
                  onClick={signInWithGoogle}
                  className="px-4 py-3 text-xs font-semibold text-white bg-slate-900 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors whitespace-nowrap"
                >
                  Google Cloud Sign-In
                </button>
              </div>
            </form>
          </div>
        </main>

        <footer className="max-w-6xl w-full mx-auto pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <span>
            FzeeLog — Organization &amp; Individual 15-Column Vehicle Logbook
          </span>
          <span className="font-mono">
            Email &amp; WhatsApp 10d/5d/1d Expiry Alerts
          </span>
        </footer>
      </div>
    );
  }

  const currentNavLabel =
    NAV_ITEMS.find((n) => n.id === activeTab)?.label || '15-Col Daily Logbook';
  const currentAccountMode: AccountMode =
    profile?.accountMode || 'Organization';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar ($260px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-900 text-slate-200 border-r border-slate-800 z-30">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap block">
              FzeeLog
            </span>
            <span className="text-[10px] font-mono text-teal-400 uppercase">
              {currentAccountMode} Mode
            </span>
          </div>
          <span className="text-xs font-mono text-teal-400">INR · KM</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-600 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2.5 text-xs">
          <div className="text-slate-400 truncate space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-teal-400">
                {currentAccountMode}
              </span>
              {currentAccountMode === 'Organization' && activeOrgMember && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-800 text-teal-300 rounded">
                  {activeOrgMember.role}
                </span>
              )}
            </div>
            <p className="font-semibold text-white truncate">
              {currentAccountMode === 'Organization' && activeOrgMember
                ? activeOrgMember.fullName
                : profile?.fullName || profile?.businessName || 'FzeeLog Fleet'}
            </p>
            <p className="font-mono text-[11px] text-slate-400 truncate">
              {profile?.alertEmail || user?.email || 'not configured'}
            </p>
            <p className="font-mono text-[11px] text-emerald-400 truncate">
              WA: {profile?.whatsappNumber || 'not set'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setAuthPortalModalOpen(true)}
            className="w-full px-3 py-2 text-xs font-semibold text-teal-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            {currentAccountMode === 'Organization'
              ? `Switch User (${organizationMembers.length})`
              : 'Org / Individual Login'}
          </button>

          {user ? (
            <button
              type="button"
              onClick={signOut}
              className="w-full px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In with Google
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract: Zone 1 Breadcrumb — Zone 2 Quick Links — Zone 3 Primary Action */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
            <div className="text-sm font-semibold text-slate-900 whitespace-nowrap truncate">
              FzeeLog <span className="text-slate-400 font-normal">/</span>{' '}
              <span>{currentNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <LanguageSwitch />
            <button
              type="button"
              onClick={() => setAuthPortalModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              {currentAccountMode === 'Organization' ? (
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
              ) : (
                <UserCheck className="w-3.5 h-3.5 text-teal-600" />
              )}
              <span>
                {currentAccountMode === 'Organization'
                  ? `Org: ${activeOrgMember?.fullName || 'Multi-User'}`
                  : 'Individual Mode'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleNavigate('notifications')}
              className="hidden sm:inline-flex px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5 text-teal-600" />
              10d/5d/1d Alerts
            </button>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0"
              >
                Install App
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSGuide(true)}
                className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors whitespace-nowrap shrink-0"
              >
                Install on iOS
              </button>
            )}

            <button
              type="button"
              onClick={() => handleNavigate('logbook')}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              15-Col Logbook
            </button>
          </div>
        </header>

        {portalNotice && (
          <div className="bg-teal-900 text-white px-4 sm:px-6 py-2 text-xs flex items-center justify-between gap-2">
            <span>{portalNotice}</span>
            <button
              type="button"
              onClick={() => setPortalNotice(null)}
              className="text-teal-200 hover:text-white font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Organization vs Individual & Multi-User Login Switcher Modal */}
        {authPortalModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[11px] font-mono uppercase text-teal-700 font-semibold">
                    Organization &amp; Individual Account Portal
                  </span>
                  <h3 className="text-lg font-bold text-slate-900">
                    Choose Usage Mode, Multi-User Login &amp; Expiry Alert Contacts
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthPortalModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step 1: Organization vs Individual Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedAccountMode('Organization')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedAccountMode === 'Organization'
                      ? 'bg-teal-50/80 border-teal-600 ring-2 ring-teal-500/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-teal-600" />
                      Organization Use
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-teal-100 text-teal-800 rounded">
                      Multi-User Login
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Multiple user logins (Admin, Fleet Manager, Accountant, Dispatcher) sharing the fleet ledger.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedAccountMode('Individual');
                    if (portalAuthTab === 'org_member_login') {
                      setPortalAuthTab('login');
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedAccountMode === 'Individual'
                      ? 'bg-teal-50/80 border-teal-600 ring-2 ring-teal-500/20'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-teal-600" />
                      Individual Use
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-200 text-slate-700 rounded">
                      Single Owner
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Personal or single owner-operator logbook and compliance reminders.
                  </p>
                </button>
              </div>

              {/* Action Tabs: Sign Up | Login | Multi-User Operator Switch */}
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setPortalAuthTab('signup')}
                  className={`flex-1 py-1.5 rounded-md font-semibold ${
                    portalAuthTab === 'signup'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign Up ({selectedAccountMode})
                </button>
                <button
                  type="button"
                  onClick={() => setPortalAuthTab('login')}
                  className={`flex-1 py-1.5 rounded-md font-semibold ${
                    portalAuthTab === 'login'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Login ({selectedAccountMode})
                </button>
                {selectedAccountMode === 'Organization' && (
                  <button
                    type="button"
                    onClick={() => setPortalAuthTab('org_member_login')}
                    className={`flex-1 py-1.5 rounded-md font-semibold ${
                      portalAuthTab === 'org_member_login'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Multi-User Switch ({organizationMembers.length})
                  </button>
                )}
              </div>

              <form onSubmit={handlePortalSubmit} className="space-y-3 text-xs">
                {portalAuthTab === 'org_member_login' &&
                selectedAccountMode === 'Organization' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Select Organization User Account
                      </label>
                      <select
                        value={
                          selectedMemberId ||
                          activeOrgMember?.id ||
                          organizationMembers[0]?.id ||
                          ''
                        }
                        onChange={(e) => setSelectedMemberId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        {organizationMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.fullName} — {m.role} ({m.email} · WA: {m.whatsappNumber})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">
                        Access PIN
                      </label>
                      <input
                        type="password"
                        value={portalPin}
                        onChange={(e) => setPortalPin(e.target.value)}
                        className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={portalFullName}
                          onChange={(e) => setPortalFullName(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          {selectedAccountMode === 'Organization'
                            ? 'Organization Name'
                            : 'Personal Fleet Name'}
                        </label>
                        <input
                          type="text"
                          required={selectedAccountMode === 'Organization'}
                          value={
                            selectedAccountMode === 'Organization'
                              ? portalOrgName
                              : portalPersonalName
                          }
                          onChange={(e) =>
                            selectedAccountMode === 'Organization'
                              ? setPortalOrgName(e.target.value)
                              : setPortalPersonalName(e.target.value)
                          }
                          placeholder={
                            selectedAccountMode === 'Organization'
                              ? ''
                              : 'Personal Vehicle Logbook'
                          }
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Alert E-Mail ID (10d, 5d, 1d Expiry)
                        </label>
                        <input
                          type="email"
                          required
                          value={portalEmail}
                          onChange={(e) => setPortalEmail(e.target.value)}
                          className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          WhatsApp Number (10d, 5d, 1d Expiry)
                        </label>
                        <input
                          type="tel"
                          required
                          value={portalWhatsapp}
                          onChange={(e) => setPortalWhatsapp(e.target.value)}
                          className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedAccountMode === 'Organization' && (
                        <div>
                          <label className="block font-medium text-slate-700 mb-1">
                            User Role
                          </label>
                          <select
                            value={portalRole}
                            onChange={(e) =>
                              setPortalRole(e.target.value as OrgMemberRole)
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="OrgAdmin">OrgAdmin</option>
                            <option value="FleetManager">FleetManager</option>
                            <option value="Accountant">Accountant</option>
                            <option value="Dispatcher">Dispatcher</option>
                            <option value="DriverViewer">DriverViewer</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">
                          Access PIN / Password
                        </label>
                        <input
                          type="password"
                          required
                          value={portalPin}
                          onChange={(e) => setPortalPin(e.target.value)}
                          className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </>
                )}

                {portalError && (
                  <div
                    role="alert"
                    className="px-3 py-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg"
                  >
                    {portalError}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setPortalError(null);
                      setAuthPortalModalOpen(false);
                    }}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={portalSubmitting}
                    className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg"
                  >
                    {portalAuthTab === 'signup'
                      ? `Save & Sign Up (${selectedAccountMode})`
                      : `Confirm Login (${selectedAccountMode})`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="bg-amber-600 text-white px-4 sm:px-6 py-2 text-xs font-medium flex items-center justify-between">
            <span>
              Offline Mode — Displaying cached fleet records. Live cloud sync will resume automatically when back online.
            </span>
            <span className="font-mono">OFFLINE</span>
          </div>
        )}

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl space-y-3">
              <h3 className="text-base font-bold text-slate-900">
                Install FzeeLog on iPhone / iPad
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                1. Tap the <strong>Share</strong> button in your Safari toolbar.
                <br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Got It
              </button>
            </div>
          </div>
        )}

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-slate-900 text-white px-4 py-3 border-b border-slate-800 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg ${
                    activeTab === item.id
                      ? 'bg-teal-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Separated Demo Mode Banner */}
        {isDemoMode && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div>
              <strong>{currentAccountMode.toUpperCase()} MODE ACTIVE:</strong>{' '}
              {currentAccountMode === 'Organization' && activeOrgMember
                ? `Logged in as ${activeOrgMember.fullName} (${activeOrgMember.role}) · `
                : ''}
              15-Column Logbook Ledger is active by default · Expiry Alerts configured for{' '}
              <span className="font-mono font-semibold">
                {profile?.alertEmail || 'not configured'}
              </span>{' '}
              &amp; WhatsApp{' '}
              <span className="font-mono font-semibold">
                {profile?.whatsappNumber || 'not set'}
              </span>{' '}
              (10d, 5d, 1d).
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleNavigate('notifications')}
                className="font-semibold text-teal-800 underline hover:text-teal-950 whitespace-nowrap"
              >
                Trigger Test Mail / WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setIsDemoMode(false)}
                className="font-semibold underline hover:text-amber-950 whitespace-nowrap"
              >
                Switch Account / Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorBanner && (
          <div className="bg-red-50 border-b border-red-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 text-xs text-red-800">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span className="truncate font-mono">{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={clearErrorBanner}
              className="text-red-700 font-semibold hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {dataLoading ? (
            <div className="space-y-4">
              <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-28 bg-white border border-slate-200 rounded-xl p-4 animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView onNavigate={handleNavigate} />
              )}
              {activeTab === 'vehicles' && (
                <VehiclesView
                  onNavigateToLogbook={(vehicleId) =>
                    handleNavigate('logbook', vehicleId)
                  }
                />
              )}
              {activeTab === 'logbook' && (
                <LogbookView initialVehicleFilter={selectedVehicleFilter} />
              )}
              {activeTab === 'finance' && <EarningsExpensesView />}
              {activeTab === 'drivers' && <DriversView />}
              {activeTab === 'maintenance' && <MaintenanceView />}
              {activeTab === 'documents' && <DocumentsExpiryView />}
              {activeTab === 'viewer3d' && <Vehicle3DInspectorView />}
              {activeTab === 'reports' && <ReportsView />}
              {activeTab === 'notifications' && (
                <GoogleDriveAndNotificationsView mode="notifications" />
              )}
              {activeTab === 'backup' && (
                <GoogleDriveAndNotificationsView mode="backup" />
              )}
              {activeTab === 'settings' && <SettingsAndSetupView />}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <I18nProvider>
      <FleetProvider>
        <FzeeLogShell />
      </FleetProvider>
    </I18nProvider>
  );
}
