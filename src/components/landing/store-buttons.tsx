"use client";

interface StoreButtonsProps {
  /** "dark" = black buttons (on light bg), "light" = white buttons (on dark bg) */
  variant?: "dark" | "light";
  className?: string;
}

export function StoreButtons({ variant = "dark", className = "" }: StoreButtonsProps) {
  const bg = variant === "dark" ? "bg-white text-black hover:bg-neutral-100 border border-neutral-200" : "bg-white text-black hover:bg-neutral-100";
  const border = variant === "dark" ? "" : "border border-white/30";

  return (
    <div className={`flex flex-col sm:flex-row items-center gap-3 ${className}`}>
      {/* App Store */}
      <a
        href="https://apps.apple.com/ph/app/hanghut-social-hangouts/id6764278827"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 px-5 py-3 rounded-xl transition-all hover:scale-105 ${bg} ${border}`}
      >
        {/* Apple logo */}
        <svg viewBox="0 0 814 1000" className="h-6 w-auto shrink-0" fill="currentColor" aria-hidden="true">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.5-155.5-118.3C46.2 736.3 0 627.3 0 522.5 0 339.1 116.3 242 230.4 242c61.3 0 112.2 40.8 150.1 40.8 36 0 92.8-43.1 164.8-43.1 26.5 0 108.2 2.6 159.2 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
        </svg>
        <div className="leading-tight text-left">
          <div className="text-[10px] font-normal opacity-80">Download on the</div>
          <div className="text-[17px] font-semibold -mt-0.5">App Store</div>
        </div>
      </a>

      {/* Google Play */}
      <a
        href="https://play.google.com/store/apps/details?id=com.hanghut.hanghut&pcampaignid=web_share"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 px-5 py-3 rounded-xl transition-all hover:scale-105 ${bg} ${border}`}
      >
        {/* Play Store icon */}
        <svg viewBox="0 0 512 512" className="h-6 w-auto shrink-0" aria-hidden="true">
          <linearGradient id="ps-a" x1="91.84" y1="6.65" x2="245.97" y2="259.42" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00a0ff"/>
            <stop offset=".007" stopColor="#00a1ff"/>
            <stop offset=".26" stopColor="#00beff"/>
            <stop offset=".512" stopColor="#00d2ff"/>
            <stop offset=".76" stopColor="#00dfff"/>
            <stop offset="1" stopColor="#00e3ff"/>
          </linearGradient>
          <linearGradient id="ps-b" x1="283.44" y1="256" x2="-15.32" y2="256" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe000"/>
            <stop offset=".409" stopColor="#ffbd00"/>
            <stop offset=".775" stopColor="orange"/>
            <stop offset="1" stopColor="#ff9c00"/>
          </linearGradient>
          <linearGradient id="ps-c" x1="204.65" y1="284.35" x2="56.39" y2="479.52" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff3a44"/>
            <stop offset="1" stopColor="#c31162"/>
          </linearGradient>
          <linearGradient id="ps-d" x1="-31.44" y1="36.4" x2="101.34" y2="212.48" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#32a071"/>
            <stop offset=".069" stopColor="#2da771"/>
            <stop offset=".476" stopColor="#15cf74"/>
            <stop offset=".801" stopColor="#06e775"/>
            <stop offset="1" stopColor="#00f076"/>
          </linearGradient>
          <path d="M27.47 8.2C16.45 19.84 10 37.9 10 61.33v389.33c0 23.44 6.45 41.5 17.47 53.14l2.8 2.67 218.13-218.13v-5.14L30.27 65.2z" fill="url(#ps-a)"/>
          <path d="M321.07 348.8l-72.67-72.8v-5.14l72.67-72.67 1.6 1.07 86.13 48.93c24.6 13.97 24.6 36.83 0 50.8L322.67 347.73z" fill="url(#ps-b)"/>
          <path d="M322.67 347.6L248.4 273.33 27.47 494.27c8.14 8.67 21.57 9.6 36.67.93l258.53-147.6" fill="url(#ps-c)"/>
          <path d="M322.67 164.4L64.13 16.93C49.04 8.13 35.6 9.2 27.47 17.87L248.4 238.67z" fill="url(#ps-d)"/>
        </svg>
        <div className="leading-tight text-left">
          <div className="text-[10px] font-normal opacity-80">Get it on</div>
          <div className="text-[17px] font-semibold -mt-0.5">Google Play</div>
        </div>
      </a>
    </div>
  );
}
