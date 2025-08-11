import { useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

import {
  HomeIcon,
  DocumentTextIcon,
  UserGroupIcon,
  ChartBarIcon,
  CogIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';

import { Menu, Transition } from '@headlessui/react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'CV Analysis', href: '/cv', icon: DocumentTextIcon },
  { name: 'LinkedIn', href: '/linkedin', icon: UserGroupIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon, adminOnly: true },
  { name: 'Settings', href: '/settings', icon: CogIcon },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, canPerformAction } = useAuth();
  const router = useRouter();

  const filteredNavigation = navigation.filter(item =>
    !item.adminOnly || canPerformAction('admin_access')
  );

  return (
    <div className="h-screen flex overflow-hidden bg-gray-100">
      {/* Mobile sidebar */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <div className="fixed inset-0 flex z-40 md:hidden">
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter="transition ease-in-out duration-300 transform"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="transition ease-in-out duration-300 transform"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
              <div className="absolute top-0 right-0 -mr-12 pt-2">
                <button
                  type="button"
                  className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                  onClick={() => setSidebarOpen(false)}
                >
                  <XMarkIcon className="h-6 w-6 text-white" />
                </button>
              </div>
              <Sidebar />
            </div>
          </Transition.Child>
        </div>
      </Transition.Root>

      {/* Static sidebar for desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <div className="sticky top-0 z-10 md:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-gray-100">
          <button
            type="button"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>
        </div>

        {/* Top bar */}
        <div className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <h1 className="text-2xl font-semibold text-gray-900">
                  {getPageTitle(router.pathname)}
                </h1>
              </div>

              <div className="flex items-center space-x-4">
                {user && user.plan !== 'pro' && (
                  <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600">
                    <span>CV: {user.usage.cvScans}/{user.plan === 'basic' ? '5' : '1'}</span>
                    <span>LinkedIn: {user.usage.linkedinScans}/{user.plan === 'basic' ? '5' : '1'}</span>
                  </div>
                )}

                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPlanBadgeColor(user?.plan)}`}>
                  {user?.plan?.toUpperCase() || 'FREE'}
                </span>

                <Menu as="div" className="relative">
                  <Menu.Button className="flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                    <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center">
                      <span className="text-white font-medium">
                        {user?.firstName?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  </Menu.Button>

                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-100"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="py-1">
                        <Menu.Item>
                          {({ active }) => (
                            <Link href="/profile" legacyBehavior>
                              <a className={`${active ? 'bg-gray-100' : ''} flex items-center px-4 py-2 text-sm text-gray-700`}>
                                <UserCircleIcon className="mr-3 h-4 w-4" />
                                Profile
                              </a>
                            </Link>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <Link href="/settings" legacyBehavior>
                              <a className={`${active ? 'bg-gray-100' : ''} flex items-center px-4 py-2 text-sm text-gray-700`}>
                                <CogIcon className="mr-3 h-4 w-4" />
                                Settings
                              </a>
                            </Link>
                          )}
                        </Menu.Item>
                        <Menu.Item>
                          {({ active }) => (
                            <button
                              onClick={logout}
                              className={`${active ? 'bg-gray-100' : ''} flex items-center w-full px-4 py-2 text-sm text-gray-700`}
                            >
                              <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4" />
                              Sign out
                            </button>
                          )}
                        </Menu.Item>
                      </div>
                    </Menu.Items>
                  </Transition>
                </Menu>
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );

  function Sidebar() {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-white border-r border-gray-200">
        <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">A</span>
              </div>
              <span className="ml-2 text-xl font-bold text-gray-900">ATS Optimizer</span>
            </div>
          </div>

          <nav className="mt-8 flex-1 px-2 space-y-1">
            {filteredNavigation.map((item) => {
              const isActive =
                router.pathname === item.href ||
                (item.href !== '/dashboard' && router.pathname.startsWith(item.href));

              return (
                <Link key={item.name} href={item.href} legacyBehavior>
                  <a
                    className={`${
                      isActive
                        ? 'bg-indigo-100 text-indigo-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } group flex items-center px-2 py-2 text-sm font-medium rounded-md`}
                  >
                    <item.icon
                      className={`${
                        isActive ? 'text-indigo-500' : 'text-gray-400 group-hover:text-gray-500'
                      } mr-3 flex-shrink-0 h-5 w-5`}
                    />
                    {item.name}
                  </a>
                </Link>
              );
            })}
          </nav>
        </div>

        {user && user.plan !== 'pro' && (
          <div className="flex-shrink-0 p-4">
            <div className="bg-indigo-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-indigo-800">Upgrade to Pro</h3>
              <p className="mt-1 text-xs text-indigo-600">
                Get unlimited scans, API access, and more features.
              </p>
              <Link href="/pricing" legacyBehavior>
                <a className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-xs font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200">
                  Upgrade Now
                </a>
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }
}

function getPageTitle(pathname) {
  const titles = {
    '/dashboard': 'Dashboard',
    '/cv': 'CV Analysis',
    '/linkedin': 'LinkedIn Optimization',
    '/analytics': 'Analytics',
    '/settings': 'Settings',
    '/profile': 'Profile',
    '/pricing': 'Pricing',
  };

  return titles[pathname] || 'ATS CV Optimizer';
}

function getPlanBadgeColor(plan) {
  switch (plan) {
    case 'pro':
      return 'bg-purple-100 text-purple-800';
    case 'basic':
      return 'bg-green-100 text-green-800';
    case 'one-time':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
