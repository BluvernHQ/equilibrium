// data/speakers.ts

export interface Speaker {
  id: string;
  name: string;
  shortName: string; // e.g., "Harry S."
  avatar: string;
}

export const speakersData: Speaker[] = [
  { 
    id: "1", 
    name: "Harry Scobie", 
    shortName: "Harry S.", 
    avatar: "/images/Speaker-image/Speaker-image1.png" 
  },
  { 
    id: "2", 
    name: "Holly Wehner", 
    shortName: "Holly W.", 
    avatar: "/images/Speaker-image/Speaker-image2.png"
  },
  { 
    id: "3", 
    name: "Erick Schowalter", 
    shortName: "Erick S.", 
    avatar: "/images/Speaker-image/Speaker-image3.png"
  },
  { 
    id: "4", 
    name: "Latoya Kilback", 
    shortName: "Latoya K.", 
    avatar: "/images/Speaker-image/Speaker-image4.png"
  },
  { 
    id: "5", 
    name: "Miriam Pagac", 
    shortName: "Miriam P.", 
    avatar: "/images/Speaker-image/Speaker-image5.png"
  },
  { 
    id: "6", 
    name: "Lillie Hickle", 
    shortName: "Lillie H.", 
    avatar: "/images/Speaker-image/Speaker-image6.png"
  },
  { 
    id: "7", 
    name: "Melanie Bashirian", 
    shortName: "Melanie B.", 
    avatar: "/images/Speaker-image/Speaker-image7.png"
  },
];