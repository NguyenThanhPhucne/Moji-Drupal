import { useId } from "react";
import type { SocialReactionType } from "@/types/social";

type ExtendedReactionType = SocialReactionType | "sad" | "angry";

interface IconProps {
  className?: string;
}

const REACTION_COLORS = {
  white: "rgb(var(--reaction-brand-white))",
  likeBlue: "rgb(var(--reaction-brand-like-blue))",
  likeCyan: "rgb(var(--reaction-brand-like-cyan))",
  likeBlueLight: "rgb(var(--reaction-brand-like-blue-light))",
  loveRedDark: "rgb(var(--reaction-brand-love-red-dark))",
  lovePinkLight: "rgb(var(--reaction-brand-love-pink-light))",
  loveRed: "rgb(var(--reaction-brand-love-red))",
  loveCoral: "rgb(var(--reaction-brand-love-coral))",
  faceBrown: "rgb(var(--reaction-brand-face-brown))",
  faceInk: "rgb(var(--reaction-brand-face-ink))",
  yellowSoft: "rgb(var(--reaction-brand-yellow-soft))",
  orange: "rgb(var(--reaction-brand-orange))",
  pink: "rgb(var(--reaction-brand-pink))",
  maroon: "rgb(var(--reaction-brand-maroon))",
  browOrange: "rgb(var(--reaction-brand-brow-orange))",
  orangeLight: "rgb(var(--reaction-brand-orange-light))",
} as const;

export const FacebookLikeIcon = ({ className = "h-5 w-5" }: IconProps) => {
  const uid = useId();
  const linearId = `${uid}-like-linear`;
  const radial1Id = `${uid}-like-radial-1`;
  const radial2Id = `${uid}-like-radial-2`;

  return (
    <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={className}>
      <path d="M16.0001 7.9996c0 4.418-3.5815 7.9996-7.9995 7.9996S.001 12.4176.001 7.9996 3.5825 0 8.0006 0C12.4186 0 16 3.5815 16 7.9996Z" fill={`url(#${linearId})`} />
      <path d="M16.0001 7.9996c0 4.418-3.5815 7.9996-7.9995 7.9996S.001 12.4176.001 7.9996 3.5825 0 8.0006 0C12.4186 0 16 3.5815 16 7.9996Z" fill={`url(#${radial1Id})`} />
      <path d="M16.0001 7.9996c0 4.418-3.5815 7.9996-7.9995 7.9996S.001 12.4176.001 7.9996 3.5825 0 8.0006 0C12.4186 0 16 3.5815 16 7.9996Z" fill={`url(#${radial2Id})`} fillOpacity=".5" />
      <path d="M7.3014 3.8662a.6974.6974 0 0 1 .6974-.6977c.6742 0 1.2207.5465 1.2207 1.2206v1.7464a.101.101 0 0 0 .101.101h1.7953c.992 0 1.7232.9273 1.4917 1.892l-.4572 1.9047a2.301 2.301 0 0 1-2.2374 1.764H6.9185a.5752.5752 0 0 1-.5752-.5752V7.7384c0-.4168.097-.8278.2834-1.2005l.2856-.5712a3.6878 3.6878 0 0 0 .3893-1.6509l-.0002-.4496ZM4.367 7a.767.767 0 0 0-.7669.767v3.2598a.767.767 0 0 0 .767.767h.767a.3835.3835 0 0 0 .3835-.3835V7.3835A.3835.3835 0 0 0 5.134 7h-.767Z" fill={REACTION_COLORS.white} />
      <defs>
        <radialGradient id={radial1Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(90 .0005 8) scale(7.99958)">
          <stop offset=".5618" stopColor={REACTION_COLORS.likeBlue} stopOpacity="0" />
          <stop offset="1" stopColor={REACTION_COLORS.likeBlue} stopOpacity=".1" />
        </radialGradient>
        <radialGradient id={radial2Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45 -4.5257 10.9237) scale(10.1818)">
          <stop offset=".3143" stopColor={REACTION_COLORS.likeCyan} />
          <stop offset="1" stopColor={REACTION_COLORS.likeCyan} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={linearId} x1="2.3989" y1="2.3999" x2="13.5983" y2="13.5993" gradientUnits="userSpaceOnUse">
          <stop stopColor={REACTION_COLORS.likeCyan} />
          <stop offset=".5" stopColor={REACTION_COLORS.likeBlue} />
          <stop offset="1" stopColor={REACTION_COLORS.likeBlueLight} />
        </linearGradient>
      </defs>
    </svg>
  );
};

export const FacebookLoveIcon = ({ className = "h-5 w-5" }: IconProps) => {
  const uid = useId();
  const linearId = `${uid}-love-linear`;
  const radialId = `${uid}-love-radial`;
  const clipId = `${uid}-love-clip`;

  return (
    <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={className}>
      <g clipPath={`url(#${clipId})`}>
        <path d="M15.9963 8c0 4.4179-3.5811 7.9993-7.9986 7.9993-4.4176 0-7.9987-3.5814-7.9987-7.9992 0-4.4179 3.5811-7.9992 7.9987-7.9992 4.4175 0 7.9986 3.5813 7.9986 7.9992Z" fill={`url(#${linearId})`} />
        <path d="M15.9973 7.9992c0 4.4178-3.5811 7.9992-7.9987 7.9992C3.5811 15.9984 0 12.417 0 7.9992S3.5811 0 7.9986 0c4.4176 0 7.9987 3.5814 7.9987 7.9992Z" fill={`url(#${radialId})`} />
        <path d="M7.9996 5.9081c-.3528-.8845-1.1936-1.507-2.1748-1.507-1.4323 0-2.4254 1.328-2.4254 2.6797 0 2.2718 2.3938 4.0094 4.0816 5.1589.3168.2157.7205.2157 1.0373 0 1.6878-1.1495 4.0815-2.8871 4.0815-5.159 0-1.3517-.993-2.6796-2.4254-2.6796-.9811 0-1.822.6225-2.1748 1.507Z" fill={REACTION_COLORS.white} />
      </g>
      <defs>
        <radialGradient id={radialId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 7.9992 -7.99863 0 7.9986 7.9992)">
          <stop offset=".5637" stopColor={REACTION_COLORS.loveRedDark} stopOpacity="0" />
          <stop offset="1" stopColor={REACTION_COLORS.loveRedDark} stopOpacity=".1" />
        </radialGradient>
        <linearGradient id={linearId} x1="2.3986" y1="2.4007" x2="13.5975" y2="13.5993" gradientUnits="userSpaceOnUse">
          <stop stopColor={REACTION_COLORS.lovePinkLight} />
          <stop offset=".5001" stopColor={REACTION_COLORS.loveRed} />
          <stop offset="1" stopColor={REACTION_COLORS.loveCoral} />
        </linearGradient>
        <clipPath id={clipId}>
          <path fill={REACTION_COLORS.white} d="M-.001.0009h15.9992v15.9984H-.001z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const FacebookHahaIcon = ({ className = "h-5 w-5" }: IconProps) => {
  const uid = useId();
  const linearId = `${uid}-haha-linear`;
  const radial1Id = `${uid}-haha-radial-1`;
  const radial2Id = `${uid}-haha-radial-2`;
  const tongueLinearId = `${uid}-haha-tongue-linear`;
  const clipId = `${uid}-haha-clip`;

  return (
    <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={className}>
      <g clipPath={`url(#${clipId})`}>
        <path d="M15.9953 7.9996c0 4.418-3.5816 7.9996-7.9996 7.9996S-.004 12.4176-.004 7.9996 3.5776 0 7.9957 0c4.418 0 7.9996 3.5815 7.9996 7.9996Z" fill={`url(#${linearId})`} />
        <path d="M15.9973 7.9992c0 4.4178-3.5811 7.9992-7.9987 7.9992C3.5811 15.9984 0 12.417 0 7.9992S3.5811 0 7.9986 0c4.4176 0 7.9987 3.5814 7.9987 7.9992Z" fill={`url(#${radial1Id})`} />
        <path d="M15.9953 7.9996c0 4.418-3.5816 7.9996-7.9996 7.9996S-.004 12.4176-.004 7.9996 3.5776 0 7.9957 0c4.418 0 7.9996 3.5815 7.9996 7.9996Z" fill={`url(#${radial2Id})`} fillOpacity=".8" />
        <path d="M12.5278 8.1957c.4057.1104.6772.4854.623.9024-.3379 2.6001-2.5167 4.9012-5.1542 4.9012s-4.8163-2.3011-5.1542-4.9012c-.0542-.417.2173-.792.623-.9024.8708-.237 2.5215-.596 4.5312-.596 2.0098 0 3.6605.359 4.5312.596Z" fill={REACTION_COLORS.faceBrown} />
        <path d="M11.5809 12.3764c-.9328.9843-2.1948 1.6228-3.5841 1.6228-1.3892 0-2.6512-.6383-3.5839-1.6225a1.5425 1.5425 0 0 0-.016-.0174c.4475-1.0137 2.2-1.3599 3.5999-1.3599 1.4 0 3.1514.3468 3.5998 1.3599l-.0157.0171Z" fill={`url(#${tongueLinearId})`} />
        <path fillRule="evenodd" clipRule="evenodd" d="M13.3049 5.8793c.1614-1.1485-.6387-2.2103-1.7872-2.3717l-.0979-.0138c-1.1484-.1614-2.2103.6388-2.3717 1.7872l-.0163.1164a.5.5 0 0 0 .9902.1392l.0163-.1164c.0846-.6016.6408-1.0207 1.2424-.9362l.0978.0138c.6016.0845 1.0207.6407.9362 1.2423l-.0164.1164a.5.5 0 0 0 .9903.1392l.0163-.1164ZM2.6902 5.8793c-.1614-1.1485.6387-2.2103 1.7872-2.3717l.0979-.0138c1.1484-.1614 2.2103.6388 2.3717 1.7872l.0164.1164a.5.5 0 1 1-.9903.1392l-.0163-.1164c-.0846-.6016-.6408-1.0207-1.2423-.9362l-.098.0138c-.6015.0845-1.0206.6407-.936 1.2423l.0163.1164a.5.5 0 0 1-.9902.1392l-.0164-.1164Z" fill={REACTION_COLORS.faceInk} />
      </g>
      <defs>
        <radialGradient id={radial1Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 7.9992 -7.99863 0 7.9986 7.9992)">
          <stop offset=".5637" stopColor={REACTION_COLORS.loveCoral} stopOpacity="0" />
          <stop offset="1" stopColor={REACTION_COLORS.loveCoral} stopOpacity=".1" />
        </radialGradient>
        <radialGradient id={radial2Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45 -4.5272 10.9202) scale(10.1818)">
          <stop stopColor={REACTION_COLORS.yellowSoft} />
          <stop offset="1" stopColor={REACTION_COLORS.yellowSoft} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={linearId} x1="2.396" y1="2.3999" x2="13.5954" y2="13.5993" gradientUnits="userSpaceOnUse">
          <stop stopColor={REACTION_COLORS.yellowSoft} />
          <stop offset="1" stopColor={REACTION_COLORS.orange} />
        </linearGradient>
        <linearGradient id={tongueLinearId} x1="5.1979" y1="10.7996" x2="5.245" y2="14.2452" gradientUnits="userSpaceOnUse">
          <stop stopColor={REACTION_COLORS.pink} />
          <stop offset=".2417" stopColor={REACTION_COLORS.loveRed} />
          <stop offset="1" stopColor={REACTION_COLORS.maroon} />
        </linearGradient>
        <clipPath id={clipId}>
          <path fill={REACTION_COLORS.white} d="M-.002 0h16v15.9992h-16z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const FacebookWowIcon = ({ className = "h-5 w-5" }: IconProps) => {
  const uid = useId();
  const linearId = `${uid}-wow-linear`;
  const radial1Id = `${uid}-wow-radial-1`;
  const radial2Id = `${uid}-wow-radial-2`;
  const clipId = `${uid}-wow-clip`;

  return (
    <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={className}>
      <g clipPath={`url(#${clipId})`}>
        <path d="M15.9972 7.9996c0 4.418-3.5815 7.9996-7.9996 7.9996-4.418 0-7.9996-3.5816-7.9996-7.9996S3.5796 0 7.9976 0c4.4181 0 7.9996 3.5815 7.9996 7.9996Z" fill={`url(#${linearId})`} />
        <path d="M15.9973 7.9992c0 4.4178-3.5811 7.9992-7.9987 7.9992C3.5811 15.9984 0 12.417 0 7.9992S3.5811 0 7.9986 0c4.4176 0 7.9987 3.5814 7.9987 7.9992Z" fill={`url(#${radial1Id})`} />
        <path d="M15.9972 7.9996c0 4.418-3.5815 7.9996-7.9996 7.9996-4.418 0-7.9996-3.5816-7.9996-7.9996S3.5796 0 7.9976 0c4.4181 0 7.9996 3.5815 7.9996 7.9996Z" fill={`url(#${radial2Id})`} fillOpacity=".8" />
        <path fillRule="evenodd" clipRule="evenodd" d="M5.6144 10.8866c.159-1.8461 1.127-2.887 2.382-2.887 1.2551 0 2.2231 1.0418 2.3822 2.887.1591 1.8461-.7342 3.1127-2.3821 3.1127-1.648 0-2.5412-1.2666-2.3821-3.1127Z" fill={REACTION_COLORS.faceBrown} />
        <ellipse cx="11.1978" cy="5.6997" rx="1.3999" ry="1.6999" fill={REACTION_COLORS.faceInk} />
        <ellipse cx="4.7979" cy="5.6997" rx="1.3999" ry="1.6999" fill={REACTION_COLORS.faceInk} />
        <path fillRule="evenodd" clipRule="evenodd" d="M12.3528 3.166a1.4744 1.4744 0 0 0-1.8591-.3279.4.4 0 1 1-.3976-.6941c.9527-.5457 2.1592-.333 2.8678.5056a.4.4 0 0 1-.6111.5163ZM5.4998 2.8381a1.4744 1.4744 0 0 0-1.859.3278.4.4 0 0 1-.6111-.5162c.7085-.8387 1.915-1.0514 2.8677-.5057a.4.4 0 0 1-.3976.6941Z" fill={REACTION_COLORS.browOrange} />
      </g>
      <defs>
        <radialGradient id={radial1Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 7.9992 -7.99863 0 7.9986 7.9992)">
          <stop offset=".5637" stopColor={REACTION_COLORS.loveCoral} stopOpacity="0" />
          <stop offset="1" stopColor={REACTION_COLORS.loveCoral} stopOpacity=".1" />
        </radialGradient>
        <radialGradient id={radial2Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45 -4.5262 10.9226) scale(10.1818)">
          <stop stopColor={REACTION_COLORS.yellowSoft} />
          <stop offset="1" stopColor={REACTION_COLORS.yellowSoft} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={linearId} x1="2.3979" y1="2.3999" x2="13.5973" y2="13.5993" gradientUnits="userSpaceOnUse">
          <stop stopColor={REACTION_COLORS.yellowSoft} />
          <stop offset="1" stopColor={REACTION_COLORS.orange} />
        </linearGradient>
        <clipPath id={clipId}>
          <path fill={REACTION_COLORS.white} d="M-.002 0h15.9992v15.9992H-.002z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const FacebookSadIcon = ({ className = "h-5 w-5" }: IconProps) => {
  const uid = useId();
  const linearId = `${uid}-sad-linear`;
  const radial1Id = `${uid}-sad-radial-1`;
  const radial2Id = `${uid}-sad-radial-2`;
  const filterId = `${uid}-sad-filter`;
  const clipId = `${uid}-sad-clip`;

  return (
    <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={className}>
      <g clipPath={`url(#${clipId})`}>
        <path d="M15.9943 8.0004c0 4.4181-3.5815 7.9996-7.9996 7.9996-4.418 0-7.9996-3.5815-7.9996-7.9996 0-4.418 3.5816-7.9995 7.9996-7.9995 4.4181 0 7.9996 3.5815 7.9996 7.9995Z" fill={`url(#${linearId})`} />
        <path d="M15.9973 7.9992c0 4.4178-3.5811 7.9992-7.9987 7.9992C3.5811 15.9984 0 12.417 0 7.9992S3.5811 0 7.9986 0c4.4176 0 7.9987 3.5814 7.9987 7.9992Z" fill={`url(#${radial1Id})`} />
        <path d="M15.9943 8.0004c0 4.4181-3.5815 7.9996-7.9996 7.9996-4.418 0-7.9996-3.5815-7.9996-7.9996 0-4.418 3.5816-7.9995 7.9996-7.9995 4.4181 0 7.9996 3.5815 7.9996 7.9995Z" fill={`url(#${radial2Id})`} fillOpacity=".8" />
        <path d="M12.3964 9.0861c0 1.1142-.3999 1.1142-1.1999 1.1142-.7999 0-1.2 0-1.2-1.1142 0-.8205.5373-1.4856 1.2-1.4856s1.1999.6651 1.1999 1.4856ZM5.9965 9.0861c0 1.1142-.4 1.1142-1.1999 1.1142-.8 0-1.2 0-1.2-1.1142 0-.8205.5373-1.4856 1.2-1.4856s1.2.6651 1.2 1.4856Z" fill={REACTION_COLORS.faceInk} />
        <path fillRule="evenodd" clipRule="evenodd" d="M7.9946 11.2002c1.6447 0 2.3999 1.0936 2.3999 1.4122 0 .1095-.084.1877-.2248.1877-.3152 0-.752-.4-2.1751-.4s-1.8599.4-2.175.4c-.1409 0-.2249-.0782-.2249-.1877 0-.3186.7552-1.4122 2.3999-1.4122Z" fill={REACTION_COLORS.faceBrown} />
        <path fillRule="evenodd" clipRule="evenodd" d="M10.7861 6.3078a3.3942 3.3942 0 0 1 1.8777 1.0409.4.4 0 0 0 .5892-.5411 4.1944 4.1944 0 0 0-2.3202-1.2862.4.4 0 1 0-.1467.7864ZM5.206 6.3078a3.3946 3.3946 0 0 0-1.8777 1.0409.4.4 0 1 1-.5891-.5411 4.1946 4.1946 0 0 1 2.3202-1.2862.4.4 0 0 1 .1467.7864Z" fill={REACTION_COLORS.browOrange} />
        <g filter={`url(#${filterId})`}>
          <path d="M2.9952 11.2004c-.2647-.003-.435.1598-1.1536 1.3088-.3267.5231-.6468 1.0515-.6468 1.691 0 .994.8 1.7999 1.8 1.7999.9999 0 1.8008-.8 1.8008-1.7999 0-.6395-.32-1.1679-.6468-1.691-.7186-1.149-.8887-1.3118-1.1536-1.3088Z" fill={REACTION_COLORS.likeCyan} fillOpacity=".9" />
        </g>
      </g>
      <defs>
        <radialGradient id={radial1Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 7.9992 -7.99863 0 7.9986 7.9992)">
          <stop offset=".5637" stopColor={REACTION_COLORS.loveCoral} stopOpacity="0" />
          <stop offset="1" stopColor={REACTION_COLORS.loveCoral} stopOpacity=".1" />
        </radialGradient>
        <radialGradient id={radial2Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45 -4.5287 10.9195) scale(10.1818)">
          <stop stopColor={REACTION_COLORS.yellowSoft} />
          <stop offset="1" stopColor={REACTION_COLORS.yellowSoft} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={linearId} x1="2.395" y1="2.4007" x2="13.5944" y2="13.6001" gradientUnits="userSpaceOnUse">
          <stop stopColor={REACTION_COLORS.yellowSoft} />
          <stop offset="1" stopColor={REACTION_COLORS.orange} />
        </linearGradient>
        <filter id={filterId} x="1.1948" y="11.2003" width="3.6006" height="4.7998" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="bg" />
          <feBlend in="SourceGraphic" in2="bg" result="shape" />
          <feColorMatrix in="SourceAlpha" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="alpha" />
          <feGaussianBlur stdDeviation="1.1999" />
          <feComposite in2="alpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix values="0 0 0 0 0.2784 0 0 0 0 0.196 0 0 0 0 0.9529 0 0 0 0.1 0" />
          <feBlend in2="shape" />
        </filter>
        <clipPath id={clipId}>
          <path fill={REACTION_COLORS.white} d="M-.003.0009h15.9993v15.9984H-.003z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const FacebookAngryIcon = ({ className = "h-5 w-5" }: IconProps) => {
  const uid = useId();
  const linearId = `${uid}-angry-linear`;
  const radial1Id = `${uid}-angry-radial-1`;
  const radial2Id = `${uid}-angry-radial-2`;
  const clipId = `${uid}-angry-clip`;

  return (
    <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className={className}>
      <g clipPath={`url(#${clipId})`}>
        <path d="M15.9972 7.9996c0 4.418-3.5815 7.9996-7.9996 7.9996-4.418 0-7.9996-3.5816-7.9996-7.9996S3.5796 0 7.9976 0c4.4181 0 7.9996 3.5815 7.9996 7.9996Z" fill={`url(#${linearId})`} />
        <path d="M15.9973 7.9992c0 4.4178-3.5811 7.9992-7.9987 7.9992C3.5811 15.9984 0 12.417 0 7.9992S3.5811 0 7.9986 0c4.4176 0 7.9987 3.5814 7.9987 7.9992Z" fill={`url(#${radial1Id})`} />
        <path d="M15.9972 7.9996c0 4.418-3.5815 7.9996-7.9996 7.9996-4.418 0-7.9996-3.5816-7.9996-7.9996S3.5796 0 7.9976 0c4.4181 0 7.9996 3.5815 7.9996 7.9996Z" fill={`url(#${radial2Id})`} fillOpacity=".8" />
        <path d="M12.3955 9.0853c0 1.1142-.4 1.1142-1.2 1.1142-.7999 0-1.1999 0-1.1999-1.1143 0-.8205.5372-1.4856 1.1999-1.4856s1.2.6651 1.2 1.4857ZM5.9956 9.0853c0 1.1142-.4 1.1142-1.2 1.1142-.8 0-1.1999 0-1.1999-1.1143 0-.8205.5372-1.4856 1.2-1.4856.6626 0 1.1999.6651 1.1999 1.4857Z" fill={REACTION_COLORS.faceInk} />
        <path fillRule="evenodd" clipRule="evenodd" d="M7.9936 11.5994c1.3257 0 2.3999.292 2.3999.8023 0 .4234-1.0742.3973-2.3999.3973-1.3256 0-2.3998.0261-2.3998-.3973 0-.5103 1.0742-.8023 2.3998-.8023Z" fill={REACTION_COLORS.faceBrown} />
        <path fillRule="evenodd" clipRule="evenodd" d="M13.3283 7.0331a.4.4 0 0 0-.5444-.1535c-.4415.2472-1.0866.4228-1.7434.5373-.6488.1132-1.2697.1604-1.6367.1691a.4.4 0 1 0 .0191.7997c.4037-.0096 1.0643-.0602 1.755-.1807.6828-.119 1.4354-.313 1.9969-.6275a.4.4 0 0 0 .1535-.5444ZM2.491 7.0331a.4.4 0 0 1 .5444-.1535c.4416.2472 1.0866.4228 1.7434.5373.6488.1132 1.2697.1604 1.6367.1691a.4.4 0 1 1-.019.7997c-.4038-.0096-1.0643-.0602-1.7551-.1807-.6827-.119-1.4353-.313-1.9968-.6275a.4.4 0 0 1-.1536-.5444Z" fill={REACTION_COLORS.maroon} />
      </g>
      <defs>
        <radialGradient id={radial1Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 7.9992 -7.99863 0 7.9986 7.9992)">
          <stop offset=".8134" stopColor={REACTION_COLORS.loveRed} stopOpacity="0" />
          <stop offset="1" stopColor={REACTION_COLORS.loveRed} stopOpacity=".1" />
        </radialGradient>
        <radialGradient id={radial2Id} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="rotate(45 -4.5272 10.9202) scale(10.1818)">
          <stop stopColor={REACTION_COLORS.orangeLight} />
          <stop offset="1" stopColor={REACTION_COLORS.orangeLight} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={linearId} x1="2.396" y1="2.3999" x2="13.5954" y2="13.5993" gradientUnits="userSpaceOnUse">
          <stop stopColor={REACTION_COLORS.orangeLight} />
          <stop offset="1" stopColor={REACTION_COLORS.loveCoral} />
        </linearGradient>
        <clipPath id={clipId}>
          <path fill={REACTION_COLORS.white} d="M-.004 0h15.9993v15.9992H-.004z" />
        </clipPath>
      </defs>
    </svg>
  );
};

export const ReactionGlyph = ({
  reaction,
  className = "h-5 w-5",
}: {
  reaction: ExtendedReactionType;
  className?: string;
}) => {
  if (reaction === "like") {
    return <FacebookLikeIcon className={className} />;
  }

  if (reaction === "love") {
    return <FacebookLoveIcon className={className} />;
  }

  if (reaction === "haha") {
    return <FacebookHahaIcon className={className} />;
  }

  if (reaction === "wow") {
    return <FacebookWowIcon className={className} />;
  }

  if (reaction === "sad") {
    return <FacebookSadIcon className={className} />;
  }

  return <FacebookAngryIcon className={className} />;
};
