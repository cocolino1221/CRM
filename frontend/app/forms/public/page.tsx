import Link from 'next/link';

export default function PublicFormsLandingPage() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Public form link is incomplete</h1>
        <p className="text-sm text-gray-600">
          Please open the full form URL, for example <span className="font-mono">/forms/public/your-slug</span>.
        </p>
        <Link
          href="/"
          className="inline-flex mt-5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
