import Link from "next/link";
import Image from "next/image";
import { BASE_PATH } from "@/lib/constants";
import {
  FacebookLogo,
  GoogleLogo,
  InstagramLogo,
  LinkedinLogo,
  WhatsappLogo,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";

const serviceLinks = [
  { label: "Social Media Marketing", href: "https://www.omnigross.in/services/social-media-marketing" },
  { label: "Lead Generation",        href: "https://www.omnigross.in/services/lead-generation" },
  { label: "Web Design",             href: "https://www.omnigross.in/services/web-design" },
  { label: "All Services",           href: "https://www.omnigross.in/services" },
];

const companyLinks = [
  { label: "About Us", href: "https://omnigross.in/about/" },
  { label: "Careers",  href: "https://www.omnigross.in/careers" },
  { label: "Gallery",  href: "https://www.omnigross.in/gallery" },
  { label: "Contact",  href: "https://www.omnigross.in/contact" },
];

const resourceLinks = [
  { label: "Blog",         href: "https://www.omnigross.in/blog" },
  { label: "Testimonials", href: "https://www.omnigross.in/testimonials" },
  { label: "Case Studies", href: "#" },
  { label: "Home",         href: "https://www.omnigross.in/" },
];

const legalLinks = [
  { label: "Privacy Policy",     href: "https://www.omnigross.in/privacy-policy" },
  { label: "Terms & Conditions", href: "https://www.omnigross.in/terms" },
  { label: "Delete Account",     href: "https://www.omnigross.in/account-deletion/" },
];

const footerGroups = [
  { title: "Services",  links: serviceLinks },
  { title: "Company",   links: companyLinks },
  { title: "Resources", links: resourceLinks },
  { title: "Legal",     links: legalLinks },
];

const socialLinks = [
  { href: "https://www.linkedin.com/company/omnigross/", label: "LinkedIn",  Icon: LinkedinLogo },
  { href: "https://x.com/OmniGross",                    label: "X",         Icon: XLogo },
  { href: "https://instagram.com/omnigross",             label: "Instagram", Icon: InstagramLogo },
  { href: "https://youtube.com/@omnigross",              label: "YouTube",   Icon: YoutubeLogo },
  { href: "https://www.google.com/maps/search/?api=1&query=OmniGross+Pune", label: "Google", Icon: GoogleLogo },
  { href: "https://facebook.com/omnigross",              label: "Facebook",  Icon: FacebookLogo },
  { href: "https://www.whatsapp.com/channel/0029Vb1gvfu96H4N1ZP37j2p", label: "WhatsApp", Icon: WhatsappLogo },
];

export default function AppFooter() {
  return (
    <footer className="border-t border-[#163638] bg-[#0E2527] text-[#A6B8B8]">
      <div className="w-full px-4 sm:px-6 md:px-12 pt-12 sm:pt-16 pb-8">
        <div className="grid grid-cols-1 gap-10 sm:gap-12 lg:grid-cols-[1.15fr_1fr]">

          {/* Left column: brand + map + social */}
          <div>
            <Link
              href="/"
              className="inline-flex max-w-full items-center gap-2.5 transition-opacity hover:opacity-90"
            >
              <Image
                src={`${BASE_PATH}/OmniGrosslogo2.png`}
                alt="OGClient"
                width={120}
                height={48}
                className="h-10 sm:h-12 w-auto shrink-0 object-contain"
              />
              <span
                className="text-[1.35rem] font-bold tracking-tight leading-none select-none"
                style={{
                  background: "linear-gradient(135deg, #4BC3C4 10%, #1F8C8F 50%, #1F6F72 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                OGClient
              </span>
            </Link>

            <p className="mt-5 sm:mt-6 max-w-md text-sm leading-relaxed text-[#A6B8B8]">
              Premium growth systems for brands that want sharper positioning,
              stronger websites, and measurable lead generation.
            </p>

            <div className="mt-7 sm:mt-8 max-w-md overflow-hidden rounded-[24px] border border-[#21484B] bg-[#133033]">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3421.797001276531!2d73.82164829999999!3d18.609677199999997!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bc2b9f7e9aaf659%3A0xd84db874c1f14070!2sOmniGross%20Enterprises!5e1!3m2!1sen!2sin!4v1782729280561!5m2!1sen!2sin"
                className="h-[200px] w-full"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>

            <div className="mt-6 sm:mt-7 flex flex-wrap items-center gap-3 sm:gap-4">
              {socialLinks.map(({ href, label, Icon }) => (
                <Link
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#21484B] text-[#A6B8B8] transition-colors hover:border-[#2A7A7C] hover:text-white"
                >
                  <Icon weight="light" size={18} />
                </Link>
              ))}
            </div>
          </div>

          {/* Right column: link groups */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6">
            {footerGroups.map((group) => (
              <div key={group.title} className="min-w-0">
                <h4 className="mb-4 text-sm font-medium text-white">{group.title}</h4>
                <ul className="space-y-3">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        target={link.href.startsWith("http") ? "_blank" : undefined}
                        rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                        prefetch={link.href.startsWith("http") ? false : undefined}
                        className="block text-sm leading-relaxed text-[#A6B8B8] transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 sm:mt-12 flex flex-col gap-5 border-t border-[#1B4144] pt-6 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-[#758E8F]">
            <p>&copy; 2026 &ndash; 2036 OGClient. All rights reserved.</p>
            <p className="mt-1 text-xs">Pune, Maharashtra, India</p>
          </div>

        </div>
      </div>
    </footer>
  );
}
