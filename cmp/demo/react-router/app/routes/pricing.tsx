import { useState } from "react";

export default function Pricing() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    "monthly",
  );

  return (
    <div>
      {/* Hero */}
      <section className="py-16 px-8 bg-gray-50 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Choose the perfect plan for your team. All plans include a 14-day
            free trial.
          </p>

          {/* Billing Toggle */}
          <div className="flex justify-center items-center gap-4">
            <span
              className={
                billingCycle === "monthly" ? "font-semibold" : "font-normal"
              }
            >
              Monthly
            </span>
            <button
              onClick={() =>
                setBillingCycle(
                  billingCycle === "monthly" ? "annual" : "monthly",
                )
              }
              className={`w-16 h-8 rounded-full transition-colors ${
                billingCycle === "annual" ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <div
                className={`w-6 h-6 bg-white rounded-full transition-transform ${
                  billingCycle === "annual" ? "translate-x-9" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={
                billingCycle === "annual" ? "font-semibold" : "font-normal"
              }
            >
              Annual <span className="text-green-600">(Save 20%)</span>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-16 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <PricingCard
            name="Starter"
            description="Perfect for small teams getting started"
            price={billingCycle === "monthly" ? 29 : 23}
            billingCycle={billingCycle}
            features={[
              "Up to 10 team members",
              "5 GB storage",
              "Basic analytics",
              "Email support",
              "Mobile app access",
            ]}
            popular={false}
          />

          <PricingCard
            name="Professional"
            description="For growing teams with advanced needs"
            price={billingCycle === "monthly" ? 79 : 63}
            billingCycle={billingCycle}
            features={[
              "Up to 50 team members",
              "50 GB storage",
              "Advanced analytics",
              "Priority support",
              "Custom integrations",
              "API access",
              "Advanced security features",
            ]}
            popular={true}
          />

          <PricingCard
            name="Enterprise"
            description="For large organizations with custom requirements"
            price={null}
            billingCycle={billingCycle}
            features={[
              "Unlimited team members",
              "Unlimited storage",
              "Custom analytics",
              "24/7 dedicated support",
              "Custom integrations",
              "Full API access",
              "Advanced security & compliance",
              "Custom SLA",
              "Dedicated account manager",
            ]}
            popular={false}
          />
        </div>
      </section>
    </div>
  );
}

function PricingCard({
  name,
  description,
  price,
  billingCycle,
  features,
  popular,
}: {
  name: string;
  description: string;
  price: number | null;
  billingCycle: "monthly" | "annual";
  features: string[];
  popular: boolean;
}) {
  return (
    <div
      className={`bg-white p-8 rounded-xl relative ${
        popular
          ? "shadow-2xl shadow-blue-500/30 border-2 border-blue-600"
          : "shadow-sm border border-gray-200"
      }`}
    >
      {popular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
          Most Popular
        </div>
      )}

      <h3 className="text-2xl font-bold mb-2">{name}</h3>
      <p className="text-gray-600 mb-6">{description}</p>

      <div className="mb-6">
        {price !== null ? (
          <>
            <span className="text-5xl font-bold">${price}</span>
            <span className="text-gray-600">
              /{billingCycle === "monthly" ? "month" : "year"}
            </span>
          </>
        ) : (
          <span className="text-4xl font-bold">Custom</span>
        )}
      </div>

      <button
        className={`w-full py-3 text-base font-semibold rounded-lg mb-6 transition-colors ${
          popular
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        {price !== null ? "Start Free Trial" : "Contact Sales"}
      </button>

      <ul className="space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="text-green-600 font-bold mt-1">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
