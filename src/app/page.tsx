import React from 'react';
import Link from 'next/link';
import { 
  CheckCircle2, 
  Trophy, 
  Stethoscope, 
  Target, 
  ChevronRight, 
  Star,
  Activity
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-800">
      
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-green-600 text-white p-2 rounded-lg">
                <Activity size={24} />
              </div>
              <span className="text-2xl font-bold text-green-700 tracking-tight">YourDietitian</span>
            </div>
            <div className="hidden md:flex space-x-8">
              <Link href="#features" className="text-gray-600 hover:text-green-600 font-medium">Features</Link>
              <Link href="#how-it-works" className="text-gray-600 hover:text-green-600 font-medium">How it Works</Link>
              <Link href="#testimonials" className="text-gray-600 hover:text-green-600 font-medium">Testimonials</Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-600 hover:text-green-600 font-medium">Log in</Link>
              <Link href="/register" className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-full font-semibold transition shadow-md">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="bg-gradient-to-br from-green-50 via-white to-green-100 py-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center">
          <div className="md:w-1/2 pr-0 md:pr-12 text-center md:text-left">
            <span className="inline-block py-1 px-3 rounded-full bg-green-100 text-green-700 text-sm font-semibold mb-6 border border-green-200">
              #1 Ranked Nutrition App
            </span>
            <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
              Reach Your Goals with <span className="text-green-600">Expert Guidance</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Track your food, join exciting fitness challenges, and consult directly with certified dietitians. Your transformation starts today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Link href="/register" className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 rounded-full font-bold text-lg transition shadow-lg flex items-center justify-center gap-2">
                Start Your Journey <ChevronRight size={20} />
              </Link>
              <Link href="#features" className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-8 py-4 rounded-full font-bold text-lg transition shadow-sm flex items-center justify-center">
                Learn More
              </Link>
            </div>
          </div>
          <div className="md:w-1/2 mt-16 md:mt-0 relative">
            {/* Abstract visual placeholder for Hero Image */}
            <div className="relative rounded-2xl shadow-2xl bg-white p-4 aspect-square max-w-md mx-auto transform rotate-3 hover:rotate-0 transition duration-500">
              <div className="absolute -top-6 -left-6 bg-yellow-400 p-4 rounded-xl shadow-lg transform -rotate-6">
                <Trophy className="text-white w-8 h-8" />
              </div>
              <div className="absolute -bottom-6 -right-6 bg-blue-500 p-4 rounded-xl shadow-lg transform rotate-6">
                <Stethoscope className="text-white w-8 h-8" />
              </div>
              <div className="w-full h-full bg-gray-100 rounded-xl overflow-hidden relative border-4 border-white shadow-inner flex flex-col items-center justify-center text-gray-400">
                  {/* You can replace this div with a real <img /> of your app later */}
                  <Activity size={64} className="mb-4 text-green-300" />
                  <p className="font-semibold text-lg">App Dashboard Preview</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything You Need to Succeed</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">We provide the tools, the experts, and the community to help you build habits that last a lifetime.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Feature 1 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-6 text-green-600">
                <Target size={32} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">Personalized Plans</h3>
              <p className="text-gray-600 leading-relaxed">Get diet and workout plans tailored specifically to your body type, goals, and dietary preferences.</p>
            </div>

            {/* Feature 2 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6 text-blue-600">
                <Stethoscope size={32} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">Expert Dietitians</h3>
              <p className="text-gray-600 leading-relaxed">Book 1-on-1 consultations with certified nutritionists who will guide you every step of the way.</p>
            </div>

            {/* Feature 3 */}
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition">
              <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center mb-6 text-orange-600">
                <Trophy size={32} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">Community Challenges</h3>
              <p className="text-gray-600 leading-relaxed">Join 30-day keto, summer shred, and other exciting challenges to stay motivated alongside others.</p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (Like MyFitnessPal's simple steps) */}
      <section id="how-it-works" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="md:w-1/2">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">How It Works</h2>
              <div className="space-y-8">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-lg">1</div>
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">Take the Questionnaire</h4>
                    <p className="text-gray-600">Tell us about your current weight, goal weight, and dietary habits so we can understand your baseline.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-lg">2</div>
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">Match with a Dietitian</h4>
                    <p className="text-gray-600">Browse our verified experts and pick the one that fits your needs. Book a consultation directly.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-lg">3</div>
                  <div>
                    <h4 className="text-xl font-bold text-gray-900 mb-2">Track & Transform</h4>
                    <p className="text-gray-600">Follow your custom plan, log your progress, join challenges, and watch your body transform.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:w-1/2 w-full">
               {/* Decorative image box */}
               <div className="bg-green-100 rounded-3xl p-8 aspect-video flex items-center justify-center shadow-inner">
                   <p className="text-green-800 font-bold text-2xl opacity-50">[ Dashboard / App Image Here ]</p>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-16">Real People, Real Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <TestimonialCard 
              name="Sarah Jenkins"
              weightLoss="Lost 15 lbs"
              text="The customized keto plan completely changed my relationship with food. My dietitian was available whenever I had a question!"
            />
            <TestimonialCard 
              name="Michael T."
              weightLoss="Gained 8 lbs Muscle"
              text="I joined the Summer Shred challenge and the community kept me so accountable. Best fitness app I've ever used."
            />
            <TestimonialCard 
              name="Priya Patel"
              weightLoss="Lost 22 lbs"
              text="Having culturally appropriate diet plans was a game changer for me. I didn't have to give up the foods I love to get healthy."
            />
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="bg-green-700 py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to change your life?</h2>
          <p className="text-green-100 text-xl mb-10">Join thousands of members who have already reached their fitness goals with us.</p>
          <Link href="/register" className="inline-block bg-white text-green-700 px-10 py-4 rounded-full font-bold text-lg hover:bg-gray-10 transition shadow-xl">
            Create Your Free Account
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-1">
             <div className="flex items-center gap-2 mb-4">
              <Activity size={24} className="text-green-500" />
              <span className="text-xl font-bold text-white tracking-tight">YourDietitian</span>
            </div>
            <p className="text-sm">Empowering you to live your healthiest life through expert guidance and powerful tools.</p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="#" className="hover:text-white transition">Features</Link></li>
              <li><Link href="#" className="hover:text-white transition">Challenges</Link></li>
              <li><Link href="#" className="hover:text-white transition">Find a Dietitian</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="#" className="hover:text-white transition">About Us</Link></li>
              <li><Link href="#" className="hover:text-white transition">Careers</Link></li>
              <li><Link href="#" className="hover:text-white transition">Contact</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="#" className="hover:text-white transition">Privacy Policy</Link></li>
              <li><Link href="#" className="hover:text-white transition">Terms of Service</Link></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-gray-800 text-sm text-center">
          <p>&copy; {new Date().getFullYear()} YourDietitian App. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}

// Reusable Testimonial Card Component
function TestimonialCard({ name, weightLoss, text }: { name: string, weightLoss: string, text: string }) {
  return (
    <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100 text-left relative mt-8">
      <div className="absolute -top-6 left-8 w-12 h-12 bg-green-200 rounded-full border-4 border-white flex items-center justify-center text-green-700 font-bold text-xl">
        {name.charAt(0)}
      </div>
      <div className="flex text-yellow-400 mb-4 mt-2">
        <Star size={16} fill="currentColor" />
        <Star size={16} fill="currentColor" />
        <Star size={16} fill="currentColor" />
        <Star size={16} fill="currentColor" />
        <Star size={16} fill="currentColor" />
      </div>
      <p className="text-gray-600 italic mb-6">"{text}"</p>
      <div>
        <p className="font-bold text-gray-900">{name}</p>
        <p className="text-sm font-semibold text-green-600">{weightLoss}</p>
      </div>
    </div>
  );
}