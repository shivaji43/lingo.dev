import { useState } from "react";

export default function Home() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-purple-600 to-purple-800 text-white py-24 px-8 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Build Amazing Products Faster
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-95">
            The all-in-one platform for modern teams to collaborate, innovate,
            and ship products that customers love.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <button
              onClick={() => setShowModal(true)}
              className="px-8 py-3 text-lg font-semibold bg-white text-purple-600 rounded-lg hover:bg-gray-100 transition-all transform hover:scale-105"
            >
              Get Started Free
            </button>
            <button className="px-8 py-3 text-lg font-semibold bg-transparent text-white border-2 border-white rounded-lg hover:bg-white hover:text-purple-600 transition-all">
              Watch Demo
            </button>
          </div>
          <p className="mt-6 text-sm opacity-80">
            No credit card required • Free 14-day trial • Cancel anytime
          </p>
        </div>
      </section>

      {/* Features Overview */}
      <section className="py-16 px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-xl text-gray-600">
              Powerful features designed to help your team work smarter, not
              harder.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon="⚡"
              title="Lightning Fast"
              description="Built for speed. Experience instant loading times and smooth interactions across all devices."
            />
            <FeatureCard
              icon="🔒"
              title="Secure by Default"
              description="Enterprise-grade security with end-to-end encryption to keep your data safe and compliant."
            />
            <FeatureCard
              icon="🤝"
              title="Team Collaboration"
              description="Real-time collaboration tools that bring your team together, no matter where they are."
            />
            <FeatureCard
              icon="📊"
              title="Advanced Analytics"
              description="Gain deep insights with powerful analytics and reporting tools to make data-driven decisions."
            />
            <FeatureCard
              icon="🎨"
              title="Customizable"
              description="Tailor every aspect to match your workflow and brand with our flexible customization options."
            />
            <FeatureCard
              icon="🌍"
              title="Global Scale"
              description="Built to scale globally with multi-region support and 99.9% uptime guarantee."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center p-12 bg-blue-50 rounded-2xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of teams already using Acme to build better products.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="px-10 py-4 text-lg font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Start Your Free Trial
          </button>
        </div>
      </section>

      {/* Modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-8 rounded-xl max-w-lg w-full"
          >
            <h3 className="text-2xl font-bold mb-4">Start Your Free Trial</h3>
            <p className="text-gray-600 mb-6">
              Get started with Acme today. No credit card required for the first
              14 days.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                alert("Form submitted!");
                setShowModal(false);
              }}
            >
              <input
                type="email"
                placeholder="Enter your email"
                required
                className="w-full px-4 py-3 mb-4 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 text-base font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 text-base font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Get Started
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white p-8 rounded-xl shadow-sm hover:shadow-md transition-shadow">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-3">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}
