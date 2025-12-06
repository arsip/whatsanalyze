export default function Custom500() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-800 mb-4">500</h1>
        <p className="text-xl text-gray-600 mb-8">Server-side error occurred</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-block bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
