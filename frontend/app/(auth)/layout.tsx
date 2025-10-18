import { MessageSquare } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-12 flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <MessageSquare className="h-7 w-7 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">SlackCRM</span>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Manage Your Team
            <br />
            Like Never Before
          </h1>
          <p className="text-xl text-blue-100">
            AI-powered CRM platform with deep Slack integration, n8n automation, and seamless Typeform workflows.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-8">
          <div>
            <div className="text-3xl font-bold text-white mb-2">2,500+</div>
            <div className="text-blue-100">Active Companies</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-2">50K+</div>
            <div className="text-blue-100">Users Worldwide</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-2">99.9%</div>
            <div className="text-blue-100">Uptime SLA</div>
          </div>
        </div>
      </div>

      {/* Right Side - Auth Forms */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}