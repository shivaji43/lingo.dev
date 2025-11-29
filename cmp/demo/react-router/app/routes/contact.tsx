import { useState } from "react";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.subject.trim()) {
      newErrors.subject = "Subject is required";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Message is required";
    } else if (formData.message.trim().length < 10) {
      newErrors.message = "Message must be at least 10 characters long";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setSubmitted(true);
      console.log("Form submitted:", formData);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  if (submitted) {
    return (
      <div className="py-16 px-8 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="text-6xl mb-4">✉️</div>
          <h1 className="text-4xl font-bold mb-4">Thank You!</h1>
          <p className="text-xl text-gray-600 mb-8">
            We've received your message and will get back to you within 24
            hours.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setFormData({
                name: "",
                email: "",
                company: "",
                subject: "",
                message: "",
              });
            }}
            className="px-8 py-3 text-base font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Send Another Message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="py-16 px-8 bg-gray-50 text-center">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold mb-4">Get in Touch</h1>
          <p className="text-xl text-gray-600">
            Have a question? We'd love to hear from you. Send us a message and
            we'll respond as soon as possible.
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div>
            <h2 className="text-3xl font-bold mb-6">Contact Information</h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Fill out the form and our team will get back to you within 24
              hours. For urgent matters, please call us directly.
            </p>

            <div className="space-y-6">
              <ContactInfoItem
                icon="📧"
                title="Email"
                value="support@acme.com"
              />
              <ContactInfoItem
                icon="📱"
                title="Phone"
                value="+1 (555) 123-4567"
              />
              <ContactInfoItem
                icon="📍"
                title="Office"
                value="123 Business St, San Francisco, CA 94102"
              />
              <ContactInfoItem
                icon="⏰"
                title="Business Hours"
                value="Monday - Friday: 9am - 6pm PST"
              />
            </div>

            <div className="mt-8 p-6 bg-blue-50 rounded-lg">
              <h3 className="text-xl font-semibold mb-2">
                Need Immediate Help?
              </h3>
              <p className="text-gray-600 mb-4">
                Check out our comprehensive documentation and FAQ section for
                instant answers.
              </p>
              <a
                href="#"
                className="inline-block text-blue-600 font-semibold hover:text-blue-700"
              >
                View Documentation →
              </a>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <form
              onSubmit={handleSubmit}
              className="bg-white p-8 rounded-xl shadow-sm border border-gray-200"
            >
              <h2 className="text-2xl font-bold mb-6">Send Us a Message</h2>

              <div className="mb-6">
                <label htmlFor="name" className="block font-medium mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name
                      ? "border-2 border-red-500"
                      : "border border-gray-300"
                  }`}
                />
                {errors.name && (
                  <p className="text-red-600 text-sm mt-1">{errors.name}</p>
                )}
              </div>

              <div className="mb-6">
                <label htmlFor="email" className="block font-medium mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.email
                      ? "border-2 border-red-500"
                      : "border border-gray-300"
                  }`}
                />
                {errors.email && (
                  <p className="text-red-600 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div className="mb-6">
                <label htmlFor="company" className="block font-medium mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mb-6">
                <label htmlFor="subject" className="block font-medium mb-2">
                  Subject *
                </label>
                <select
                  id="subject"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.subject
                      ? "border-2 border-red-500"
                      : "border border-gray-300"
                  }`}
                >
                  <option value="">Select a subject</option>
                  <option value="sales">Sales Inquiry</option>
                  <option value="support">Technical Support</option>
                  <option value="billing">Billing Question</option>
                  <option value="partnership">Partnership Opportunity</option>
                  <option value="other">Other</option>
                </select>
                {errors.subject && (
                  <p className="text-red-600 text-sm mt-1">{errors.subject}</p>
                )}
              </div>

              <div className="mb-6">
                <label htmlFor="message" className="block font-medium mb-2">
                  Message *
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={5}
                  className={`w-full px-4 py-3 rounded-lg text-base resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.message
                      ? "border-2 border-red-500"
                      : "border border-gray-300"
                  }`}
                />
                {errors.message && (
                  <p className="text-red-600 text-sm mt-1">{errors.message}</p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 text-base font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContactInfoItem({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="text-4xl">{icon}</div>
      <div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-gray-600">{value}</p>
      </div>
    </div>
  );
}
