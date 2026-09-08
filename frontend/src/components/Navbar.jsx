import { NavLink } from "react-router-dom";

const tools = [
  { to: "/pdf-to-pptx", label: "PDF to PPTX", accent: "#9F2B1E" },
  { to: "/word-to-pdf", label: "Word to PDF", accent: "#1D4ED8" },
  { to: "/pdf-to-docs", label: "PDF to Docs", accent: "#0F766E" },
];

const Navbar = () => {
  return (
    <nav className="border-b border-[#D8D3C7] bg-[#FDFCFA] sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
        <span className="font-serif text-lg font-semibold tracking-tight text-[#1C1B19] py-4">
          Convert<span className="text-[#9F2B1E]">.</span>
        </span>

        <div className="flex items-center gap-1">
          {tools.map((tool) => (
            <NavLink
              key={tool.to}
              to={tool.to}
              className={({ isActive }) =>
                `relative px-4 py-4 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[#1C1B19]"
                    : "text-[#6E685F] hover:text-[#1C1B19]"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {tool.label}
                  <span
                    className="absolute left-4 right-4 -bottom-px h-[2px] rounded-full transition-opacity"
                    style={{
                      backgroundColor: tool.accent,
                      opacity: isActive ? 1 : 0,
                    }}
                  />
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;