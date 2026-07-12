import { AUTHOR_NAME, GITHUB_URL } from './siteConfig';

function Footer({ variant = "light" }: { variant?: "light" | "dark" }) {
  const textClass = variant === "dark" ? "text-gray-300" : "text-gray-400";
  const linkClass = variant === "dark" ? "text-gray-100 hover:text-white" : "text-gray-600 hover:text-black";

  return (
    <div className={`text-[11px] text-center py-2 ${textClass}`}>
      Built by {AUTHOR_NAME} ·{" "}
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline ${linkClass}`}
      >
        GitHub
      </a>
    </div>
  );
}

export default Footer;
