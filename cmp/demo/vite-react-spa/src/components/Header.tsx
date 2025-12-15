import { LocaleSwitcher } from "@lingo.dev/compiler/react";

export default function Header() {
  return (
    <header className="p-4 flex gap-4 items-center justify-between bg-gray-800 text-white shadow-lg">
      <span>Lingo.dev compiler Tanstack router demo</span>
      <LocaleSwitcher
        locales={[
          { code: "en", label: "English" },
          { code: "es", label: "Spanish" },
          { code: "de", label: "Deutsch" },
          { code: "fr", label: "Français" },
        ]}
        className="locale-switcher"
      />
    </header>
  );
}
