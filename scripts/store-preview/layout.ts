import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/inter";

const scene = new URLSearchParams(location.search).get("scene") ?? "inbox";
const copy = {
  inbox: ["YOUR PERSONAL INBOX", "Keep it\nwithin reach.", "Move notes and files between your own devices, from a familiar place in your browser.", "Personal Microsoft account · Your OneDrive"],
  downloads: ["READY ON THIS DEVICE", "Download once.\nFind it again.", "Open a safe download, reveal it in your file manager, or remove just the local copy.", "Local copies and cloud items stay separate"],
  dark: ["MADE FOR EVERY DAY", "Settle into\nyour own space.", "Choose a Light or Dark appearance and control when the sidebar checks for new items.", "Your appearance · Your refresh preferences"]
} as const;
const selected = copy[scene as keyof typeof copy] ?? copy.inbox;
["eyebrow", "headline", "description", "detail"].forEach((id, i) => {
  document.getElementById(id)!.textContent = selected[i];
});
(document.getElementById("panel") as HTMLIFrameElement).src = `./panel.html?scene=${encodeURIComponent(scene)}`;
document.body.classList.toggle("dark", scene === "dark");
