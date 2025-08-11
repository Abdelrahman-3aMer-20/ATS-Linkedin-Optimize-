import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { cvAPI, linkedinAPI } from '../lib/api';
import { getScoreColor, getScoreBadgeColor } from '../lib/api';
import {
  DocumentTextIcon,
  UserGroupIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { format } from 'date-fns';

export default function Dashboard() {
  const { user, canPerformAction, getRemainingScans } = useAuth();
  const [stats, setStats] = useState({
    cvAnalyses: 0,
    linkedinAnalyses: 0,
    averageCVScore: 0,
    averageLinkedInScore: 0,
  });
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [cvHistory, linkedinHistory] = await Promise.all([
        cvAPI.getHistory({ limit: 5 }),
        linkedinAPI.getHistory({ limit: 5 }),
      ]);

      const cvAnalyses = cvHistory.data.analyses;
      const linkedinAnalyses = linkedinHistory.data.analyses;

      const avgCVScore = cvAnalyses.length > 0
        ? cvAnalyses.reduce((sum, analysis) => sum + analysis.atsScore, 0) / cvAnalyses.length
        : 0;

      const avgLinkedInScore = linkedinAnalyses.length > 0
        ? linkedinAnalyses.reduce((sum, analysis) => sum + analysis.optimizationScore, 0) / linkedinAnalyses.length
        : 0;

      setStats({
        cvAnalyses: cvAnalyses.length,
        linkedinAnalyses: linkedinAnalyses.length,
        averageCVScore: Math.round(avgCVScore),
        averageLinkedInScore: Math.round(avgLinkedInScore),
      });

      const combined = [
        ...cvAnalyses.map(analysis => ({ ...analysis, type: 'cv' })),
        ...linkedinAnalyses.map(analysis => ({ ...analysis, type: 'linkedin' })),
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setRecentAnalyses(combined.slice(0, 5));
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Welcome back, {user?.firstName}! 👋
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  Here's your ATS optimization overview
                </p>
              </div>
              <div className="flex space-x-3">
                <Link href="/cv" className="btn-primary">
                  <DocumentTextIcon className="h-4 w-4 mr-2" />
                  Analyze CV
                </Link>
                <Link href="/linkedin" className="btn-secondary">
                  <UserGroupIcon className="h-4 w-4 mr-2" />
                  Optimize LinkedIn
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="CV Analyses" value={stats.cvAnalyses} icon={DocumentTextIcon} color="blue" subtitle={`${getRemainingScans('cv') === -1 ? 'Unlimited' : getRemainingScans('cv')} remaining`} />
          <StatCard title="LinkedIn Analyses" value={stats.linkedinAnalyses} icon={UserGroupIcon} color="green" subtitle={`${getRemainingScans('linkedin') === -1 ? 'Unlimited' : getRemainingScans('linkedin')} remaining`} />
          <StatCard title="Avg CV Score" value={`${stats.averageCVScore}%`} icon={ChartBarIcon} color="purple" subtitle="ATS Compatibility" />
          <StatCard title="Avg LinkedIn Score" value={`${stats.averageLinkedInScore}%`} icon={ArrowTrendingUpIcon} color="yellow" subtitle="Optimization Level" />
        </div>

        {/* Plan section */}
        {/* ... Keep rest as-is ... */}

      </div>
    </Layout>
  );
}

function StatCard({ title, value, icon: Icon, color, subtitle }) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    purple: 'text-purple-600 bg-purple-100',
    yellow: 'text-yellow-600 bg-yellow-100',
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`p-3 rounded-md ${colorClasses[color]}`}>
              <Icon className="h-6 w-6" />
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">{value}</dd>
              {subtitle && <dd className="text-sm text-gray-600">{subtitle}</dd>}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({ title, description, href, icon: Icon, disabled = false }) {
  const content = (
    <div className={`p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}`}>
      <div className="flex items-center">
        <Icon className="h-8 w-8 text-gray-400" />
        <div className="ml-4">
          <h4 className="text-sm font-medium text-gray-900">{title}</h4>
          <p className="text-sm text-gray-500">{description}</p>
        </div>
      </div>
    </div>
  );

  return disabled ? content : <Link href={href}>{content}</Link>;
}
