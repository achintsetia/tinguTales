import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import BlurImage from "../components/BlurImage";
import {
  BookOpen, ArrowLeft, ArrowRight, Check, Upload, Plus, Sparkles,
  User, Globe, Heart, Rocket, TreePine, Fish, Music, Palette, Star,
  Plane, Train, Crown, Zap, ChefHat, Gamepad2, Cat, Trash2, Shuffle,
  Flame, Sun, Mountain, Feather, Tent, Lamp, BookHeart, Drama,
  AlertCircle, RotateCcw, Gift, Trophy, GraduationCap, PartyPopper,
} from "lucide-react";
import { db, storage, functions } from "../firebase";
import { collection, query, where, onSnapshot, deleteDoc, doc as firestoreDoc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { httpsCallable } from "firebase/functions";

const LANGUAGES = [
  { code: "en", name: "English", native: "English", font: "" },
  { code: "hi", name: "Hindi", native: "\u0939\u093f\u0928\u094d\u0926\u0940", font: "font-hindi" },
  { code: "kn", name: "Kannada", native: "\u0c95\u0ca8\u0ccd\u0ca8\u0ca1", font: "font-kannada" },
  { code: "ta", name: "Tamil", native: "\u0ba4\u0bae\u0bbf\u0bb4\u0bcd", font: "font-tamil" },
  { code: "te", name: "Telugu", native: "\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41", font: "font-telugu" },
  { code: "mr", name: "Marathi", native: "\u092e\u0930\u093e\u0920\u0940", font: "font-marathi" },
  { code: "bn", name: "Bengali", native: "\u09ac\u09be\u0982\u09b2\u09be", font: "font-bengali" },
  { code: "gu", name: "Gujarati", native: "\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0", font: "font-gujarati" },
  { code: "ml", name: "Malayalam", native: "\u0d2e\u0d32\u0d2f\u0d3e\u0d33\u0d02", font: "font-malayalam" },
];

const INTEREST_OPTIONS = [
  // Adventure & Exploration
  { id: "rockets", label: "Rockets & Space", icon: Rocket },
  { id: "dinosaurs", label: "Dinosaurs", icon: Zap },
  { id: "animals", label: "Animals", icon: Cat },
  { id: "airplanes", label: "Airplanes", icon: Plane },
  { id: "trains", label: "Trains", icon: Train },
  { id: "nature", label: "Nature & Trees", icon: TreePine },
  { id: "ocean", label: "Ocean & Fish", icon: Fish },
  { id: "superheroes", label: "Superheroes", icon: Star },
  { id: "princesses", label: "Royalty & Palaces", icon: Crown },
  // Creative & Learning
  { id: "music", label: "Music & Dance", icon: Music },
  { id: "art", label: "Art & Colors", icon: Palette },
  { id: "cooking", label: "Cooking & Food", icon: ChefHat },
  { id: "sports", label: "Sports & Games", icon: Gamepad2 },
  { id: "friendship", label: "Friendship & Family", icon: Heart },
  // Indian Culture & Festivals
  { id: "diwali", label: "Diwali & Lights", icon: Lamp },
  { id: "holi", label: "Holi & Colors", icon: Palette },
  { id: "festivals", label: "Indian Festivals", icon: Star },
  { id: "mythology", label: "Gods & Mythology", icon: Flame },
  { id: "folklore", label: "Folktales & Fables", icon: BookHeart },
  { id: "village-life", label: "Village & Mela", icon: Tent },
  { id: "rangoli", label: "Rangoli & Patterns", icon: Palette },
  { id: "chai-stories", label: "Grandma's Stories", icon: Flame },
  { id: "harvest", label: "Harvest & Farming", icon: Sun },
  { id: "wisdom", label: "Wit & Wisdom", icon: Drama },
  { id: "rivers-mountains", label: "Rivers & Mountains", icon: Mountain },
  { id: "courage", label: "Bravery & Courage", icon: Star },
  { id: "magic", label: "Magic & Wonder", icon: Sparkles },
  { id: "kindness", label: "Kindness & Sharing", icon: Heart },
];

// Quick Story Templates — grouped by age range and category
const TEMPLATE_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "adventure", label: "Adventure" },
  { id: "cultural", label: "Indian Culture" },
  { id: "learning", label: "Learning" },
  { id: "bedtime", label: "Bedtime" },
  { id: "occasion", label: "Occasions 🎉" },
];

const STORY_TEMPLATES = [
  // ═══ ADVENTURE TEMPLATES ═══
  { id: "bedtime-moon", title: "Goodnight Moon Walk", desc: "A calming bedtime story about stars and the moon", interests: ["nature", "magic", "kindness"], ageMin: 2, ageMax: 4, color: "#3730A3", icon: Star, category: "bedtime" },
  { id: "animal-friends", title: "Animal Friends", desc: "Making friends with cute farm and forest animals", interests: ["animals", "friendship", "village-life"], ageMin: 2, ageMax: 4, color: "#2A9D8F", icon: Cat, category: "adventure" },
  { id: "rainbow-colors", title: "Rainbow Adventure", desc: "Discovering colors in a magical garden", interests: ["art", "nature", "magic"], ageMin: 2, ageMax: 4, color: "#E76F51", icon: Palette, category: "learning" },
  { id: "choo-choo", title: "Choo Choo Journey", desc: "A fun train ride through India", interests: ["trains", "animals", "village-life"], ageMin: 2, ageMax: 4, color: "#FF9F1C", icon: Train, category: "adventure" },
  { id: "splashy-ocean", title: "Splashy Ocean Day", desc: "Playing with fish and turtles at the beach", interests: ["ocean", "animals", "nature"], ageMin: 2, ageMax: 5, color: "#3730A3", icon: Fish, category: "adventure" },
  { id: "dino-explorer", title: "Dino Explorer", desc: "Travel back in time to meet friendly dinosaurs", interests: ["dinosaurs", "nature", "courage"], ageMin: 4, ageMax: 6, color: "#2A9D8F", icon: Zap, category: "adventure" },
  { id: "sky-pilot", title: "Sky Pilot", desc: "Flying an airplane over mountains and rivers", interests: ["airplanes", "rivers-mountains", "courage"], ageMin: 4, ageMax: 7, color: "#FF9F1C", icon: Plane, category: "adventure" },
  { id: "jungle-safari", title: "Jungle Safari", desc: "An exciting safari through an Indian jungle", interests: ["animals", "nature", "courage"], ageMin: 4, ageMax: 7, color: "#2A9D8F", icon: TreePine, category: "adventure" },
  { id: "magic-kitchen", title: "Magic Kitchen", desc: "Cooking a magical dish that grants wishes", interests: ["cooking", "magic", "friendship"], ageMin: 4, ageMax: 7, color: "#E76F51", icon: ChefHat, category: "adventure" },
  { id: "space-mission", title: "Space Mission", desc: "Blasting off to explore planets and meet aliens", interests: ["rockets", "superheroes", "courage"], ageMin: 5, ageMax: 8, color: "#3730A3", icon: Rocket, category: "adventure" },
  { id: "super-kid", title: "Super Kid", desc: "Discovering superpowers and saving the day", interests: ["superheroes", "courage", "friendship"], ageMin: 5, ageMax: 8, color: "#E76F51", icon: Star, category: "adventure" },
  { id: "music-quest", title: "The Music Quest", desc: "Finding magical instruments across India", interests: ["music", "magic", "village-life"], ageMin: 5, ageMax: 8, color: "#2A9D8F", icon: Music, category: "adventure" },
  { id: "royal-adventure", title: "Royal Adventure", desc: "A day as a prince/princess in a magical palace", interests: ["princesses", "magic", "courage"], ageMin: 5, ageMax: 8, color: "#FF9F1C", icon: Crown, category: "adventure" },
  { id: "sports-champ", title: "Sports Champion", desc: "Training for the big game and learning teamwork", interests: ["sports", "friendship", "courage"], ageMin: 5, ageMax: 8, color: "#3730A3", icon: Gamepad2, category: "adventure" },
  { id: "ocean-mystery", title: "Ocean Mystery", desc: "Diving deep to discover a lost underwater city", interests: ["ocean", "courage", "magic"], ageMin: 7, ageMax: 10, color: "#3730A3", icon: Fish, category: "adventure" },
  { id: "invention-lab", title: "The Invention Lab", desc: "Building amazing gadgets to help the village", interests: ["rockets", "wisdom", "village-life"], ageMin: 7, ageMax: 10, color: "#2A9D8F", icon: Rocket, category: "learning" },
  { id: "nature-guardian", title: "Nature Guardian", desc: "Protecting the forest and its magical creatures", interests: ["nature", "animals", "courage"], ageMin: 7, ageMax: 10, color: "#2A9D8F", icon: TreePine, category: "adventure" },
  { id: "time-traveler", title: "Time Traveler", desc: "Visiting ancient India and meeting historical heroes", interests: ["mythology", "courage", "wisdom"], ageMin: 7, ageMax: 10, color: "#E76F51", icon: Zap, category: "adventure" },
  { id: "cooking-competition", title: "The Grand Cook-Off", desc: "Competing in a magical cooking competition", interests: ["cooking", "friendship", "village-life"], ageMin: 7, ageMax: 10, color: "#FF9F1C", icon: ChefHat, category: "adventure" },

  // ═══ CULTURAL / INDIAN HERITAGE TEMPLATES ═══
  // langs: ["all"] = pan-Indian, specific codes = shown when that language is selected

  // -- Pan-Indian Festivals --
  { id: "festival-diwali", title: "Festival of Lights", desc: "Celebrating Diwali — diyas, rangoli, sweets and the story of good over evil", interests: ["diwali", "rangoli", "cooking", "mythology"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Lamp, category: "cultural", langs: ["all"] },
  { id: "festival-holi", title: "Colors of Holi", desc: "Playing with colors, water balloons and celebrating the arrival of spring", interests: ["holi", "festivals", "friendship", "music"], ageMin: 3, ageMax: 8, color: "#E76F51", icon: Palette, category: "cultural", langs: ["all"] },
  { id: "festival-rakhi", title: "The Rakhi Promise", desc: "A brother-sister bond — tying Rakhi and the promise to always protect each other", interests: ["festivals", "friendship", "courage", "kindness"], ageMin: 4, ageMax: 8, color: "#E76F51", icon: Heart, category: "cultural", langs: ["all"] },
  { id: "festival-ganesh", title: "Ganesh Chaturthi", desc: "Making a clay Ganesha, modak sweets and the elephant-headed god's wisdom", interests: ["festivals", "mythology", "art", "cooking"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Star, category: "cultural", langs: ["all"] },
  { id: "festival-eid", title: "Eid Celebrations", desc: "Sharing sevaiyan, wearing new clothes and spreading love on Eid", interests: ["festivals", "cooking", "friendship", "kindness"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Star, category: "cultural", langs: ["all"] },
  { id: "festival-christmas", title: "Christmas in India", desc: "Stars, cakes, carols and the joy of giving during Christmas", interests: ["festivals", "music", "kindness", "cooking"], ageMin: 3, ageMax: 8, color: "#E76F51", icon: Star, category: "cultural", langs: ["all"] },
  { id: "festival-republic", title: "Republic Day Parade", desc: "The grand parade, flag hoisting and celebrating India's Constitution", interests: ["festivals", "courage", "friendship"], ageMin: 4, ageMax: 10, color: "#FF9F1C", icon: Star, category: "cultural", langs: ["all"] },
  { id: "festival-independence", title: "Freedom Day", desc: "Independence Day — tricolor kites, patriotic songs and tales of brave heroes", interests: ["festivals", "courage", "music"], ageMin: 4, ageMax: 10, color: "#2A9D8F", icon: Star, category: "cultural", langs: ["all"] },

  // -- Hindi / North India (hi) --
  { id: "hi-chhath", title: "Chhath Puja", desc: "Standing in the river at sunrise, offering prayers to the Sun God", interests: ["festivals", "rivers-mountains", "nature", "kindness"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Sun, category: "cultural", langs: ["hi"] },
  { id: "hi-navratri", title: "Nine Nights of Garba", desc: "Navratri — Garba, Dandiya, colorful outfits and the triumph of Goddess Durga", interests: ["festivals", "music", "mythology", "courage"], ageMin: 4, ageMax: 8, color: "#E76F51", icon: Music, category: "cultural", langs: ["hi"] },
  { id: "hi-lohri", title: "Lohri Bonfire Night", desc: "Dancing around the bonfire, eating rewri and popcorn on a cold winter night", interests: ["festivals", "music", "cooking", "friendship"], ageMin: 3, ageMax: 7, color: "#FF9F1C", icon: Flame, category: "cultural", langs: ["hi"] },
  { id: "hi-karva-chauth", title: "Moon & Love", desc: "A story about waiting for the moon and the power of love and devotion", interests: ["festivals", "mythology", "kindness"], ageMin: 5, ageMax: 8, color: "#3730A3", icon: Star, category: "cultural", langs: ["hi"] },
  { id: "hi-baisakhi", title: "Baisakhi Harvest", desc: "Celebrating the harvest season with bhangra, new crops and community joy", interests: ["harvest", "music", "festivals", "village-life"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Sun, category: "cultural", langs: ["hi"] },
  { id: "hi-janmashtami", title: "Krishna Janmashtami", desc: "Celebrating baby Krishna's birthday — dahi handi, songs and midnight joy", interests: ["mythology", "festivals", "music", "friendship"], ageMin: 3, ageMax: 8, color: "#3730A3", icon: Star, category: "cultural", langs: ["hi"] },

  // -- Kannada / Karnataka (kn) --
  { id: "kn-ugadi", title: "Ugadi New Year", desc: "Kannada New Year — neem-jaggery mix, new clothes and the panchanga reading", interests: ["festivals", "cooking", "village-life", "nature"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Star, category: "cultural", langs: ["kn"] },
  { id: "kn-dasara", title: "Mysore Dasara", desc: "The grand Mysore palace lit up, the golden elephant procession and Jamboo Savari", interests: ["festivals", "mythology", "princesses", "courage"], ageMin: 4, ageMax: 10, color: "#FF9F1C", icon: Crown, category: "cultural", langs: ["kn"] },
  { id: "kn-makara-sankranti", title: "Suggi & Ellu Bella", desc: "Flying kites, sharing ellu-bella and visiting friends on Sankranti", interests: ["festivals", "friendship", "harvest", "cooking"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Sun, category: "cultural", langs: ["kn"] },
  { id: "kn-karaga", title: "The Karaga Festival", desc: "Bangalore's ancient festival — the goddess carried on a devotee's head", interests: ["festivals", "mythology", "courage", "village-life"], ageMin: 5, ageMax: 10, color: "#E76F51", icon: Flame, category: "cultural", langs: ["kn"] },
  { id: "kn-varamahalakshmi", title: "Varamahalakshmi Vrata", desc: "Decorating the kalasha, making holige and praying to Goddess Lakshmi", interests: ["festivals", "mythology", "cooking", "art"], ageMin: 4, ageMax: 8, color: "#FF9F1C", icon: Star, category: "cultural", langs: ["kn"] },
  { id: "kn-hampi", title: "Tales of Hampi", desc: "Exploring the ancient ruins of Vijayanagara — giant boulders, temples and stories", interests: ["folklore", "courage", "rivers-mountains", "wisdom"], ageMin: 5, ageMax: 10, color: "#2A9D8F", icon: Mountain, category: "cultural", langs: ["kn"] },

  // -- Tamil / Tamil Nadu (ta) --
  { id: "ta-pongal", title: "Pongal Celebration", desc: "Cooking sweet pongal in a clay pot until it overflows — thanking the Sun and cattle", interests: ["harvest", "cooking", "festivals", "nature"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Sun, category: "cultural", langs: ["ta"] },
  { id: "ta-jallikattu", title: "The Brave Jallikattu", desc: "The courage of village youth taming bulls during the harvest festival", interests: ["festivals", "courage", "animals", "village-life"], ageMin: 5, ageMax: 10, color: "#E76F51", icon: Flame, category: "cultural", langs: ["ta"] },
  { id: "ta-karthigai", title: "Karthigai Deepam", desc: "Lighting rows and rows of oil lamps on a full moon night", interests: ["diwali", "festivals", "kindness", "nature"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Lamp, category: "cultural", langs: ["ta"] },
  { id: "ta-thirukkural", title: "Thirukkural Wisdom", desc: "Stories inspired by Thiruvalluvar's ancient verses — truth, kindness and virtue", interests: ["wisdom", "folklore", "kindness"], ageMin: 5, ageMax: 10, color: "#3730A3", icon: BookHeart, category: "cultural", langs: ["ta"] },
  { id: "ta-navaratri-golu", title: "Navaratri Golu", desc: "Setting up the doll steps, visiting homes and singing songs for the goddesses", interests: ["festivals", "art", "music", "mythology"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Music, category: "cultural", langs: ["ta"] },
  { id: "ta-silapathikaram", title: "Kannagi's Anklet", desc: "A child-friendly tale of Kannagi and the golden anklet — a story of justice", interests: ["folklore", "courage", "wisdom"], ageMin: 6, ageMax: 10, color: "#E76F51", icon: Drama, category: "cultural", langs: ["ta"] },

  // -- Telugu / Andhra Pradesh & Telangana (te) --
  { id: "te-ugadi", title: "Telugu Ugadi", desc: "New Year with ugadi pachadi — six tastes that represent life's experiences", interests: ["festivals", "cooking", "village-life", "wisdom"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Star, category: "cultural", langs: ["te"] },
  { id: "te-sankranti", title: "Sankranti & Rangoli", desc: "Three days of celebration — Bhogi fire, kite flying and giant muggu rangoli", interests: ["festivals", "rangoli", "harvest", "friendship"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Sun, category: "cultural", langs: ["te"] },
  { id: "te-bathukamma", title: "Bathukamma Flowers", desc: "Building a tower of flowers, singing and dancing around it — Telangana's pride", interests: ["festivals", "nature", "music", "art"], ageMin: 3, ageMax: 8, color: "#E76F51", icon: Palette, category: "cultural", langs: ["te"] },
  { id: "te-bonalu", title: "Bonalu Festival", desc: "Carrying decorated pots to the temple — Hyderabad's vibrant goddess festival", interests: ["festivals", "mythology", "village-life", "music"], ageMin: 4, ageMax: 8, color: "#FF9F1C", icon: Flame, category: "cultural", langs: ["te"] },
  { id: "te-deccan", title: "Tales of the Deccan", desc: "Stories from the ancient Deccan plateau — Golconda fort, Kohinoor diamond and more", interests: ["folklore", "courage", "princesses", "wisdom"], ageMin: 5, ageMax: 10, color: "#3730A3", icon: Crown, category: "cultural", langs: ["te"] },

  // -- Marathi / Maharashtra (mr) --
  { id: "mr-gudi-padwa", title: "Gudi Padwa", desc: "Raising the Gudi flag, puran poli and the Marathi New Year celebration", interests: ["festivals", "cooking", "village-life", "mythology"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Star, category: "cultural", langs: ["mr"] },
  { id: "mr-ganpati", title: "Ganpati Bappa Morya", desc: "10 days of Ganesh festival — making eco-friendly idols, modak and visarjan", interests: ["festivals", "mythology", "art", "music"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Star, category: "cultural", langs: ["mr"] },
  { id: "mr-shivaji", title: "Young Shivaji's Courage", desc: "Stories of young Shivaji — building forts, befriending villagers and brave deeds", interests: ["courage", "folklore", "wisdom", "nature"], ageMin: 5, ageMax: 10, color: "#E76F51", icon: Flame, category: "cultural", langs: ["mr"] },
  { id: "mr-pola", title: "Pola — The Bull Festival", desc: "Decorating and honouring bulls with colors, naivedya and processions", interests: ["festivals", "animals", "village-life", "kindness"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Cat, category: "cultural", langs: ["mr"] },
  { id: "mr-makar-sankranti", title: "Til Gul & Kites", desc: "Exchanging til-gul sweets, flying kites and saying 'til gul ghya, god god bola'", interests: ["festivals", "cooking", "friendship", "harvest"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Sun, category: "cultural", langs: ["mr"] },
  { id: "mr-pandharpur", title: "Varkari Pilgrimage", desc: "Walking to Pandharpur with the Varkaris, singing abhangs along the way", interests: ["music", "mythology", "kindness", "village-life"], ageMin: 5, ageMax: 10, color: "#3730A3", icon: Music, category: "cultural", langs: ["mr"] },

  // -- Bengali / West Bengal (bn) --
  { id: "bn-durga-puja", title: "Durga Puja Magic", desc: "Five days of pandal hopping, dhunuchi dance, sindoor khela and Goddess Durga", interests: ["festivals", "mythology", "music", "art"], ageMin: 3, ageMax: 8, color: "#E76F51", icon: Flame, category: "cultural", langs: ["bn"] },
  { id: "bn-poila-baisakh", title: "Poila Baisakh", desc: "Bengali New Year — new clothes, alpona art, mishti doi and festive feasts", interests: ["festivals", "art", "cooking", "village-life"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Star, category: "cultural", langs: ["bn"] },
  { id: "bn-saraswati-puja", title: "Saraswati Puja", desc: "Wearing yellow, placing books at the goddess's feet and starting new learning", interests: ["festivals", "mythology", "wisdom", "art"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: BookHeart, category: "cultural", langs: ["bn"] },
  { id: "bn-rath-yatra", title: "Rath Yatra", desc: "Pulling the giant chariot of Lord Jagannath through the streets", interests: ["festivals", "mythology", "courage", "village-life"], ageMin: 4, ageMax: 8, color: "#FF9F1C", icon: Star, category: "cultural", langs: ["bn"] },
  { id: "bn-rabindranath", title: "Rabindranath's Tales", desc: "Stories inspired by Tagore — the postmaster, Kabuliwala and the child's world", interests: ["folklore", "wisdom", "kindness", "nature"], ageMin: 5, ageMax: 10, color: "#3730A3", icon: Drama, category: "cultural", langs: ["bn"] },
  { id: "bn-luchi-alur-dom", title: "Festival Feast", desc: "Making luchi, alur dom and payesh with the family on a festive morning", interests: ["cooking", "festivals", "friendship", "village-life"], ageMin: 3, ageMax: 7, color: "#E76F51", icon: ChefHat, category: "cultural", langs: ["bn"] },

  // -- Gujarati / Gujarat (gu) --
  { id: "gu-navratri", title: "Navratri Garba Night", desc: "Nine nights of Garba in Gujarat — colorful chaniya choli, dandiya sticks and devotion to Goddess Amba", interests: ["festivals", "music", "mythology", "art"], ageMin: 3, ageMax: 8, color: "#E76F51", icon: Music, category: "cultural", langs: ["gu"] },
  { id: "gu-uttarayan", title: "Uttarayan — Kite Festival", desc: "The sky fills with kites on Makar Sankranti — Cut! Kaapo che! and rooftop celebrations all day", interests: ["festivals", "friendship", "harvest", "courage"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Sun, category: "cultural", langs: ["gu"] },
  { id: "gu-makar-sankranti", title: "Tal Sankli & Undhiyu", desc: "Making sesame sweets and the famous Gujarati undhiyu feast on Sankranti morning", interests: ["festivals", "cooking", "family", "village-life"], ageMin: 3, ageMax: 7, color: "#2A9D8F", icon: ChefHat, category: "cultural", langs: ["gu"] },
  { id: "gu-janmashtami", title: "Dahi Handi in Gujarat", desc: "Building a human pyramid to break the dahi handi — celebrating Krishna Janmashtami", interests: ["mythology", "festivals", "courage", "friendship"], ageMin: 4, ageMax: 8, color: "#3730A3", icon: Star, category: "cultural", langs: ["gu"] },
  { id: "gu-rann-of-kutch", title: "The White Desert Adventure", desc: "A magical journey to the Rann of Kutch — white salt desert, full moon and Kutchi crafts", interests: ["nature", "folklore", "rivers-mountains", "art"], ageMin: 5, ageMax: 10, color: "#2A9D8F", icon: Mountain, category: "cultural", langs: ["gu"] },
  { id: "gu-bestu-varas", title: "Diwali & Bestu Varas", desc: "Gujarati New Year — lighting diyas, business books puja and Annakut feast of 108 dishes", interests: ["festivals", "diwali", "cooking", "mythology"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Lamp, category: "cultural", langs: ["gu"] },

  // -- Malayalam / Kerala (ml) --
  { id: "ml-onam", title: "Onam Harvest Home", desc: "Pookalam flower carpet, Onasadya feast and the legend of King Mahabali coming back to Kerala", interests: ["harvest", "festivals", "cooking", "mythology"], ageMin: 3, ageMax: 8, color: "#2A9D8F", icon: Sun, category: "cultural", langs: ["ml"] },
  { id: "ml-vishu", title: "Vishu Kani & Crackers", desc: "Waking at dawn to see Vishu Kani — gold, rice, flowers and new beginnings in Kerala", interests: ["festivals", "nature", "mythology", "cooking"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Star, category: "cultural", langs: ["ml"] },
  { id: "ml-thrissur-pooram", title: "Thrissur Pooram", desc: "Elephants in glittering decorations, parasol exchanges and fireworks at the world's greatest festival", interests: ["festivals", "animals", "music", "mythology"], ageMin: 4, ageMax: 10, color: "#E76F51", icon: Flame, category: "cultural", langs: ["ml"] },
  { id: "ml-kathakali", title: "The Kathakali Dancer", desc: "A child learns Kathakali — the green face paint, expressive eyes and Mahabharata stories", interests: ["music", "mythology", "art", "folklore"], ageMin: 5, ageMax: 10, color: "#3730A3", icon: Drama, category: "cultural", langs: ["ml"] },
  { id: "ml-boat-race", title: "Nehru Trophy Snake Boat", desc: "Riding the famous snake boat in Alappuzha backwaters — the oarsmen chant Vanchipattu!", interests: ["festivals", "courage", "rivers-mountains", "village-life"], ageMin: 4, ageMax: 10, color: "#2A9D8F", icon: Fish, category: "cultural", langs: ["ml"] },
  { id: "ml-theyyam", title: "The Theyyam Spirit", desc: "A colourful Theyyam ritual in the village — half god, half human and full of wonder", interests: ["mythology", "folklore", "village-life", "courage"], ageMin: 5, ageMax: 10, color: "#E76F51", icon: Flame, category: "cultural", langs: ["ml"] },

  // -- Panchatantra & Folklore --
  { id: "pancha-monkey-crocodile", title: "The Clever Monkey", desc: "Panchatantra: A smart monkey outwits a crocodile on the river", interests: ["folklore", "animals", "wisdom", "courage"], ageMin: 3, ageMax: 7, color: "#2A9D8F", icon: BookHeart, category: "cultural" },
  { id: "pancha-crow-pitcher", title: "The Thirsty Crow", desc: "Panchatantra: A clever crow finds a way to drink water from a tall pitcher", interests: ["folklore", "animals", "wisdom"], ageMin: 2, ageMax: 5, color: "#3730A3", icon: Feather, category: "cultural" },
  { id: "pancha-tortoise-geese", title: "The Talking Tortoise", desc: "Panchatantra: A tortoise who couldn't stop talking and the lesson learned", interests: ["folklore", "animals", "wisdom", "friendship"], ageMin: 4, ageMax: 8, color: "#E76F51", icon: BookHeart, category: "cultural" },
  { id: "pancha-lion-mouse", title: "The Lion and the Mouse", desc: "Panchatantra: A tiny mouse saves a mighty lion — kindness is never wasted", interests: ["folklore", "animals", "kindness", "courage"], ageMin: 2, ageMax: 6, color: "#FF9F1C", icon: BookHeart, category: "cultural" },
  { id: "folk-tenali-rama", title: "Tenali Rama's Wit", desc: "The clever court jester who solved problems with humor and intelligence", interests: ["folklore", "wisdom", "courage", "village-life"], ageMin: 5, ageMax: 10, color: "#3730A3", icon: Drama, category: "cultural" },
  { id: "folk-birbal", title: "Birbal's Wisdom", desc: "Emperor Akbar's wisest minister solves an impossible riddle", interests: ["folklore", "wisdom", "courage", "princesses"], ageMin: 5, ageMax: 10, color: "#2A9D8F", icon: Drama, category: "cultural" },

  // -- Mythology-inspired (child-friendly) --
  { id: "myth-hanuman", title: "Little Hanuman's Flight", desc: "Baby Hanuman flies to catch the sun thinking it's a mango — a tale of courage", interests: ["mythology", "courage", "superheroes", "nature"], ageMin: 3, ageMax: 8, color: "#FF9F1C", icon: Flame, category: "cultural" },
  { id: "myth-krishna-butter", title: "Krishna's Butter Pots", desc: "Little Krishna and his friends sneak butter from the village — playful mischief", interests: ["mythology", "cooking", "friendship", "village-life"], ageMin: 2, ageMax: 6, color: "#3730A3", icon: Star, category: "cultural" },
  { id: "myth-ganga", title: "The River from the Sky", desc: "How the holy Ganga came down from heaven — a tale of devotion and nature", interests: ["mythology", "rivers-mountains", "nature", "courage"], ageMin: 5, ageMax: 10, color: "#2A9D8F", icon: Mountain, category: "cultural" },
  { id: "myth-lakshmi", title: "Lakshmi and the Owl", desc: "Why the goddess of wealth rides an owl — a story about patience and wisdom", interests: ["mythology", "animals", "wisdom", "kindness"], ageMin: 4, ageMax: 8, color: "#FF9F1C", icon: Star, category: "cultural" },

  // -- Regional & Nature --
  { id: "cultural-chai", title: "Grandma's Chai Story", desc: "Grandma tells stories while making chai — cardamom, ginger and warm memories", interests: ["chai-stories", "cooking", "friendship", "village-life"], ageMin: 3, ageMax: 7, color: "#E76F51", icon: Flame, category: "cultural" },
  { id: "cultural-rangoli", title: "The Magic Rangoli", desc: "Drawing a rangoli that comes to life with colorful animals and flowers", interests: ["rangoli", "art", "magic", "animals"], ageMin: 3, ageMax: 7, color: "#FF9F1C", icon: Palette, category: "cultural" },
  { id: "cultural-banyan", title: "The Wise Banyan Tree", desc: "An ancient banyan tree shares stories with the children of the village", interests: ["folklore", "nature", "wisdom", "village-life"], ageMin: 4, ageMax: 8, color: "#2A9D8F", icon: TreePine, category: "cultural" },
  { id: "cultural-mela", title: "The Village Mela", desc: "A magical fair with puppet shows, ferris wheels, cotton candy and new friends", interests: ["village-life", "music", "friendship", "magic"], ageMin: 3, ageMax: 7, color: "#E76F51", icon: Tent, category: "cultural" },

  // ═══ OCCASION / MILESTONE TEMPLATES ═══
  { id: "occ-birthday", title: "Happy Birthday Adventure!", desc: "A magical quest where [child] discovers the best birthday gift is the joy they bring to others", interests: ["magic", "friendship", "kindness"], ageMin: 2, ageMax: 10, color: "#FF9F1C", icon: PartyPopper, category: "occasion" },
  { id: "occ-birthday-cake", title: "The Magic Birthday Cake", desc: "Baking a birthday cake with family — each ingredient adds a special wish that comes true", interests: ["cooking", "magic", "kindness"], ageMin: 2, ageMax: 7, color: "#E76F51", icon: ChefHat, category: "occasion" },
  { id: "occ-achievement", title: "Champion of the Day", desc: "Celebrating a big win — a medal, a prize or just doing something incredibly brave", interests: ["courage", "friendship", "wisdom"], ageMin: 4, ageMax: 10, color: "#3730A3", icon: Trophy, category: "occasion" },
  { id: "occ-graduation", title: "Cap & Gown Hero", desc: "The big graduation day — crossing the stage, family cheers and a brand new adventure begins", interests: ["courage", "wisdom", "friendship"], ageMin: 5, ageMax: 10, color: "#2A9D8F", icon: GraduationCap, category: "occasion" },
  { id: "occ-first-day-school", title: "First Day at School", desc: "Nervous at first, then making a new best friend — the magical adventure of starting school", interests: ["courage", "friendship", "kindness"], ageMin: 3, ageMax: 6, color: "#3730A3", icon: BookOpen, category: "occasion" },
  { id: "occ-new-sibling", title: "A New Baby!", desc: "The day a little brother or sister arrives — big feelings, surprises and big-kid pride", interests: ["kindness", "friendship", "courage"], ageMin: 3, ageMax: 7, color: "#E76F51", icon: Heart, category: "occasion" },
  { id: "occ-moving-house", title: "Our New Home", desc: "Moving to a new house — saying goodbye to old friends while finding exciting new ones", interests: ["courage", "friendship", "kindness"], ageMin: 4, ageMax: 8, color: "#2A9D8F", icon: Tent, category: "occasion" },
  { id: "occ-sports-day", title: "Sports Day Champion", desc: "Training all year for the big races on Sports Day — teamwork, sportsmanship and crossing the finish line", interests: ["sports", "courage", "friendship"], ageMin: 5, ageMax: 10, color: "#FF9F1C", icon: Trophy, category: "occasion" },
  { id: "occ-gift-giving", title: "The Gift of Giving", desc: "The best gift isn't bought — it's made with love and given with a full heart", interests: ["kindness", "art", "friendship"], ageMin: 3, ageMax: 7, color: "#E76F51", icon: Gift, category: "occasion" },
  { id: "occ-exam-success", title: "The Big Test", desc: "Studying hard, feeling nervous, then acing the exam — hard work and confidence always pay off", interests: ["wisdom", "courage", "friendship"], ageMin: 6, ageMax: 10, color: "#3730A3", icon: Star, category: "occasion" },

  // ═══ BEDTIME TEMPLATES ═══
  { id: "bedtime-stars", title: "Counting Stars", desc: "Lying on the terrace, counting stars and dreaming of adventures", interests: ["nature", "magic", "chai-stories"], ageMin: 2, ageMax: 5, color: "#3730A3", icon: Star, category: "bedtime" },
  { id: "bedtime-lullaby", title: "The Lullaby River", desc: "A gentle river sings a lullaby that carries dreams to sleeping children", interests: ["music", "rivers-mountains", "magic"], ageMin: 2, ageMax: 4, color: "#2A9D8F", icon: Music, category: "bedtime" },
  { id: "bedtime-cloud", title: "Cloud Pillow", desc: "Riding on a soft cloud to visit the land of dreams", interests: ["nature", "magic", "kindness"], ageMin: 2, ageMax: 5, color: "#3730A3", icon: Sun, category: "bedtime" },

  // ═══ LEARNING TEMPLATES ═══
  { id: "learn-alphabets", title: "The Alphabet Garden", desc: "Each letter grows into a plant — A for Aam, B for Bandar, C for Chameli", interests: ["nature", "art", "village-life"], ageMin: 2, ageMax: 5, color: "#2A9D8F", icon: BookOpen, category: "learning" },
  { id: "learn-numbers", title: "Counting with Animals", desc: "Count 1 elephant, 2 parrots, 3 peacocks in a colorful Indian zoo", interests: ["animals", "nature", "wisdom"], ageMin: 2, ageMax: 5, color: "#FF9F1C", icon: BookOpen, category: "learning" },
  { id: "learn-seasons", title: "India's Six Seasons", desc: "Discovering Vasant, Grishma, Varsha, Sharad, Hemant and Shishir", interests: ["nature", "harvest", "rivers-mountains"], ageMin: 4, ageMax: 8, color: "#E76F51", icon: Sun, category: "learning" },
];

const STEPS = [
  { num: 1, label: "Child" },
  { num: 2, label: "Language" },
  { num: 3, label: "Interests" },
  { num: 4, label: "Pages" },
  { num: 5, label: "Review" },
];

const PRICING_TABLE = { 6: 79, 8: 99, 10: 129, 12: 149 };

export default function CreateStory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { storyId: urlStoryId } = useParams<{ storyId: string }>();
  const [step, setStep] = useState(1);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [selectedLang, setSelectedLang] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateFilter, setTemplateFilter] = useState("all");
  const [customInterest, setCustomInterest] = useState("");
  const [customIncident, setCustomIncident] = useState("");
  const [pageCount, setPageCount] = useState(8);
  const [draftStoryId, setDraftStoryId] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [editedPages, setEditedPages] = useState([]);
  const [loadingStep, setLoadingStep] = useState(0);
  const loadingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [approving, setApproving] = useState(false);
  const [nativeChildName, setNativeChildName] = useState("");
  const [transliterating, setTransliterating] = useState(false);
  const [transliterationDone, setTransliterationDone] = useState(false);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: "", age: "", gender: "" });
  const [photoFile, setPhotoFile] = useState(null);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [paymentsEnabled] = useState(false);
  const [deleteUploadPrompt, setDeleteUploadPrompt] = useState<{
    profileId: string; photoPath: string; profileName: string;
  } | null>(null);
  const [deletingUpload, setDeletingUpload] = useState(false);
  // Track previous avatar statuses to detect completed transitions
  const prevStatusesRef = useRef<Record<string, string>>({});

  // Subscribe to child profiles in real-time via Firestore
  useEffect(() => {
    if (!user?.id) return;
    const q = query(
      collection(db, "child_profiles"),
      where("user_id", "==", user.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => d.data());
      setProfiles(data);
      setLoadingProfiles(false);
      setSelectedProfile((prev) => {
        if (!prev) return prev;
        const updated = data.find((p) => p.profile_id === prev.profile_id);
        return updated ?? prev;
      });
      // Detect transitions to "completed" — prompt to delete the upload
      data.forEach((p) => {
        const prev = prevStatusesRef.current[p.profile_id];
        const isNewlyCompleted =
          (prev === "pending" || prev === "generating") &&
          p.avatar_status === "completed" &&
          p.photo_url;
        if (isNewlyCompleted) {
          setDeleteUploadPrompt({
            profileId: p.profile_id,
            photoPath: p.photo_url,
            profileName: p.name,
          });
        }
        prevStatusesRef.current[p.profile_id] = p.avatar_status;
      });
    }, (err) => {
      console.error("Profiles subscription error:", err);
      setLoadingProfiles(false);
    });
    return () => unsubscribe();
  }, [user?.id]);

  useEffect(() => {
    // Razorpay script is not needed — payments are currently disabled
  }, []);

  // Auto-transliterate child's name when language changes
  useEffect(() => {
    setNativeChildName("");
    setTransliterationDone(false);

    if (!selectedLang || selectedLang.code === "en" || !selectedProfile?.name) return;

    const transliterate = async () => {
      setTransliterating(true);
      try {
        const transliterateFn = httpsCallable<
          {name: string; languageCode: string},
          {transliterated: string; languageCode: string}
        >(functions, "transliterateChildName");
        const result = await transliterateFn({
          name: selectedProfile.name,
          languageCode: selectedLang.code,
        });
        const transliterated = result.data.transliterated;
        if (transliterated && transliterated !== selectedProfile.name) {
          setNativeChildName(transliterated);
          setTransliterationDone(true);
        }
      } catch (e) {
        console.error("Transliteration failed:", e);
      } finally {
        setTransliterating(false);
      }
    };
    transliterate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLang, selectedProfile?.name]);

  // ── Restore from URL storyId (/create/:storyId) ────────────────────────
  // Runs once when profiles are loaded and a URL storyId is present
  const urlRestoredRef = useRef(false);
  useEffect(() => {
    if (!urlStoryId || urlRestoredRef.current || profiles.length === 0) return;
    urlRestoredRef.current = true;
    getDoc(firestoreDoc(db, "stories", urlStoryId)).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      // Restore profile
      const p = profiles.find((pr) => pr.profile_id === data.profile_id);
      if (p) setSelectedProfile(p);
      // Restore language
      const lang = LANGUAGES.find((l) => l.code === data.language_code);
      if (lang) setSelectedLang(lang);
      // Restore interests, page count, incident, template
      if (data.interests?.length) setSelectedInterests(data.interests);
      if (data.page_count) setPageCount(data.page_count);
      if (data.custom_incident) setCustomIncident(data.custom_incident);
      if (data.selected_template) setSelectedTemplate(data.selected_template);
      if (data.native_child_name) { setNativeChildName(data.native_child_name); setTransliterationDone(true); }
      // Set draft state
      setDraftStoryId(urlStoryId);
      if (data.title) setDraftTitle(data.title);
      // Jump to step 5 — the existing resume logic in the step useEffect will load pages
      setStep(5);
    }).catch((e) => console.error("Could not restore story from URL:", e));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStoryId, profiles]);
  const WIZARD_KEY = "tingu_wizard_state";

  const saveWizardState = useCallback(() => {
    const state = {
      step,
      profileId: selectedProfile?.profile_id || null,
      langCode: selectedLang?.code || null,
      interests: selectedInterests,
      template: selectedTemplate,
      pageCount,
      customIncident,
      nativeChildName,
      draftStoryId: draftStoryId || null,
      draftTitle: draftTitle || null,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(WIZARD_KEY, JSON.stringify(state));
  }, [step, selectedProfile, selectedLang, selectedInterests, selectedTemplate, pageCount, customIncident, nativeChildName, draftStoryId, draftTitle]);

  // Save state after each meaningful step change (including when draft ID arrives)
  useEffect(() => {
    if (step >= 2 && selectedProfile) saveWizardState();
  }, [step, selectedProfile, selectedLang, selectedInterests, pageCount, draftStoryId, saveWizardState]);

  // Restore wizard state on mount
  useEffect(() => {
    const raw = localStorage.getItem(WIZARD_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      // Only restore if saved within last 24 hours
      if (saved.savedAt && (Date.now() - new Date(saved.savedAt).getTime()) > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(WIZARD_KEY);
        return;
      }
      // Restore after profiles load
      const restoreTimeout = setTimeout(() => {
        if (saved.profileId && profiles.length > 0) {
          const p = profiles.find((pr) => pr.profile_id === saved.profileId);
          if (p) setSelectedProfile(p);
        }
        if (saved.langCode) {
          const lang = LANGUAGES.find((l) => l.code === saved.langCode);
          if (lang) setSelectedLang(lang);
        }
        if (saved.interests?.length) setSelectedInterests(saved.interests);
        if (saved.template) setSelectedTemplate(saved.template);
        if (saved.pageCount) setPageCount(saved.pageCount);
        if (saved.customIncident) setCustomIncident(saved.customIncident);
        if (saved.nativeChildName) setNativeChildName(saved.nativeChildName);
        if (saved.draftStoryId) setDraftStoryId(saved.draftStoryId);
        if (saved.draftTitle) setDraftTitle(saved.draftTitle);
        // Restore step — step 5 is OK because we'll load the existing draft from Firestore
        if (saved.step && saved.step >= 2 && saved.step <= 5) {
          setStep(saved.step);
        }
      }, 500);
      return () => clearTimeout(restoreTimeout);
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles]);

  // Clear wizard state on successful approve (story creation started)
  const clearWizardState = () => localStorage.removeItem(WIZARD_KEY);

  const handleCreateProfile = async () => {
    if (!newProfile.name || !newProfile.age) {
      toast.error("Please enter name and age");
      return;
    }
    setSavingProfile(true);
    try {
      let photoStoragePath = "";
      let photoDownloadUrl = "";
      if (photoFile && user?.id) {
        const ext = photoFile.name.split(".").pop() ?? "jpg";
        const fileName = `${Date.now()}.${ext}`;
        const fileRef = storageRef(storage, `${user.id}/uploads/${fileName}`);
        await uploadBytes(fileRef, photoFile);
        photoDownloadUrl = await getDownloadURL(fileRef);
        photoStoragePath = fileRef.fullPath;
      }

      const createProfileFn = httpsCallable(functions, "createChildProfile");
      const result = await createProfileFn({
        name: newProfile.name,
        age: parseInt(newProfile.age),
        gender: newProfile.gender,
        photo_storage_path: photoStoragePath,
        photo_download_url: photoDownloadUrl,
      });

      // onSnapshot will update the profiles list automatically;
      // sync selectedProfile immediately so step 2 transitions work
      const created = result.data as Record<string, unknown>;
      setSelectedProfile({ ...created, photo_download_url: photoDownloadUrl });
      setShowNewProfile(false);
      setNewProfile({ name: "", age: "", gender: "" });
      setPhotoFile(null);
      setPhotoPreview(null);
      toast.success("Profile created!");
    } catch (e) {
      toast.error("Failed to create profile");
      console.error(e);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRetryAvatar = async (e: React.MouseEvent, profileId: string) => {
    e.stopPropagation();
    try {
      const retryFn = httpsCallable(functions, "retryAvatarGeneration");
      await retryFn({ profile_id: profileId });
      toast.info("Retrying avatar generation...");
    } catch (e) {
      toast.error("Failed to start retry");
      console.error(e);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setPhotoPreview(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleDeletePhoto = async (e, profileId) => {
    e.stopPropagation();
    try {
      const profile = profiles.find((p) => p.profile_id === profileId);
      // Delete the uploaded photo from Storage (client has delete permission for uploads/)
      if (profile?.photo_url) {
        try { await deleteObject(storageRef(storage, profile.photo_url)); } catch { /* ignore */ }
      }
      // Delete the Firestore document (security rules allow owner to delete)
      await deleteDoc(firestoreDoc(db, "child_profiles", profileId));
      if (selectedProfile?.profile_id === profileId) {
        setSelectedProfile(null);
      }
      toast.success("Profile deleted");
    } catch (e) {
      toast.error("Failed to delete profile");
    }
  };

  const handleConfirmDeleteUpload = async (confirm: boolean) => {
    if (!deleteUploadPrompt) return;
    const { profileId, photoPath } = deleteUploadPrompt;
    setDeleteUploadPrompt(null);
    if (!confirm) return;
    setDeletingUpload(true);
    try {
      await deleteObject(storageRef(storage, photoPath));
      await updateDoc(firestoreDoc(db, "child_profiles", profileId), {
        photo_url: "",
        photo_download_url: "",
      });
      toast.success("Original photo deleted to save storage space.");
    } catch {
      toast.error("Could not delete the original photo.");
    } finally {
      setDeletingUpload(false);
    }
  };


  const toggleInterest = (id) => {
    setSelectedInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 6 ? [...prev, id] : prev
    );
  };

  const addCustomInterest = () => {
    if (customInterest.trim() && selectedInterests.length < 6) {
      setSelectedInterests((prev) => [...prev, customInterest.trim()]);
      setCustomInterest("");
    }
  };

  // ── Draft flow ──────────────────────────────────────────────────────────
  const handleGenerateDraft = async () => {
    if (!selectedProfile || !selectedLang || selectedInterests.length === 0) return;
    setDraftLoading(true);
    setDraftError("");
    setDraftStatus("drafting");
    try {
      const generateFn = httpsCallable<
        {
          profileId: string; language: string; languageCode: string;
          interests: string[]; pageCount: number;
          customIncident?: string; nativeChildName?: string;
        },
        {storyId: string; title: string; titleEnglish: string; draftPages: {page: number; text: string}[]; status: string}
      >(functions, "generateStoryDraft", {timeout: 570000}); // 9.5 min client timeout

      const result = await generateFn({
        profileId: selectedProfile.profile_id,
        language: selectedLang.name,
        languageCode: selectedLang.code,
        interests: selectedInterests,
        pageCount: pageCount,
        customIncident: customIncident.trim() || undefined,
        nativeChildName: (selectedLang?.code !== "en" && nativeChildName.trim()) ? nativeChildName.trim() : undefined,
      });

      const {storyId, title, draftPages} = result.data;
      setDraftStoryId(storyId);
      setDraftTitle(title);
      setEditedPages(draftPages);
      setDraftStatus("draft_ready");
      setDraftLoading(false);
      // Update URL to /create/:storyId so the session is bookmarkable/resumable
      navigate(`/create/${storyId}`, { replace: true });
      // Persist template & nativeChildName into the Firestore doc
      updateDoc(firestoreDoc(db, "stories", storyId), {
        selected_template: selectedTemplate || null,
        native_child_name: nativeChildName.trim() || null,
      }).catch(() => {/* best-effort */});
    } catch (e) {
      setDraftError("Failed to generate story. Please try again.");
      setDraftLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!draftStoryId || editedPages.length === 0) return;

    // Payments disabled — directly approve and generate illustrations
    try {
      setApproving(true);
        const approveFn = httpsCallable<
          {storyId: string; pagesText: {page: number; text: string}[]},
          {storyId: string; status: string}
        >(functions, "approveStoryDraft");
        await approveFn({storyId: draftStoryId, pagesText: editedPages});
        clearWizardState();
        toast.success("Generating illustrations...");
        navigate(`/story/${draftStoryId}`);
    } catch (e) {
      toast.error("Story generation failed. Please try again.");
      setApproving(false);
    }
  };

  // Auto-trigger draft when entering step 5; reset when navigating back to early steps
  useEffect(() => {
    if (step === 5) {
      if (draftStoryId && editedPages.length === 0 && !draftLoading) {
        // Resume: load existing draft from Firestore instead of regenerating
        setDraftLoading(true);
        setDraftStatus("loading");
        getDoc(firestoreDoc(db, "stories", draftStoryId)).then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.status === "draft_ready" && data.draft_pages?.length > 0) {
              setDraftTitle(data.title || "");
              setEditedPages(data.draft_pages.map((p: {page: number; text: string}) => ({page: p.page, text: p.text})));
              setDraftStatus("draft_ready");
              setDraftLoading(false);
              // Ensure URL reflects this story ID
              navigate(`/create/${draftStoryId}`, { replace: true });
              return;
            }
          }
          // Doc missing or not ready — fall back to generating
          setDraftStoryId(null);
          setDraftTitle("");
          handleGenerateDraft();
        }).catch(() => {
          setDraftStoryId(null);
          handleGenerateDraft();
        });
      } else if (!draftStoryId && !draftLoading) {
        handleGenerateDraft();
      }
    }
    // Only clear draft when user navigates back to steps 1–3 (changing key params)
    if (step < 4) {
      setDraftStoryId(null);
      setDraftLoading(false);
      setDraftStatus("");
      setDraftError("");
      setDraftTitle("");
      setEditedPages([]);
      setApproving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Advance loading steps on a timer while generation is running
  const LOADING_STEPS = [
    { label: "Reading the profile...", sub: `Getting to know ${selectedProfile?.name || "your child"}`, delay: 0 },
    { label: "Understanding the interests...", sub: "Picking the best themes for the story", delay: 8000 },
    { label: "Planning the story arc...", sub: "Mapping out the adventure, beat by beat", delay: 22000 },
    { label: `Writing in ${selectedLang?.name || "your language"}...`, sub: "Crafting every sentence with care", delay: 42000 },
    { label: "Checking quality...", sub: "Making sure every word is just right", delay: 100000 },
    { label: "Putting on the finishing touches...", sub: "Almost ready!", delay: 140000 },
  ];

  useEffect(() => {
    // Clear any existing timers
    loadingTimersRef.current.forEach(clearTimeout);
    loadingTimersRef.current = [];

    if (!draftLoading) {
      setLoadingStep(0);
      return;
    }

    setLoadingStep(0);
    LOADING_STEPS.slice(1).forEach((s, i) => {
      const t = setTimeout(() => setLoadingStep(i + 1), s.delay);
      loadingTimersRef.current.push(t);
    });

    return () => {
      loadingTimersRef.current.forEach(clearTimeout);
      loadingTimersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLoading]);

  const canProceed = () => {
    if (step === 2) return !!selectedLang;
    if (step === 3) return selectedInterests.length > 0;
    if (step === 4) return true;
    return true;
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      {/* Delete-upload confirmation dialog */}
      <Dialog open={!!deleteUploadPrompt} onOpenChange={(open) => { if (!open) setDeleteUploadPrompt(null); }}>
        <DialogContent className="rounded-3xl border-2 border-[#F3E8FF] max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Fredoka" }} className="text-[#1E1B4B] text-xl">
              Avatar ready! 🎉
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#1E1B4B]/70 mt-1">
            {deleteUploadPrompt?.profileName}'s cartoon avatar has been created.
            Would you like to delete the original uploaded photo to save storage space?
          </p>
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              className="flex-1 rounded-full border-[#F3E8FF]"
              onClick={() => handleConfirmDeleteUpload(false)}
            >
              Keep Photo
            </Button>
            <Button
              className="flex-1 rounded-full bg-[#E76F51] hover:bg-[#E76F51]/80 text-white"
              disabled={deletingUpload}
              onClick={() => handleConfirmDeleteUpload(true)}
            >
              <Trash2 className="w-4 h-4 mr-1.5" strokeWidth={2} />
              {deletingUpload ? "Deleting..." : "Delete Upload"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Header */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#FDFBF7]/80 border-b border-[#F3E8FF]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-2 text-[#1E1B4B]/60 hover:text-[#1E1B4B] transition-colors">
            <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
            <span className="text-sm font-medium">Back</span>
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#FF9F1C]" strokeWidth={2.5} />
            <span className="text-lg font-semibold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>New Story</span>
          </div>
          <div className="w-16" />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Progress Steps — clickable for completed steps */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center gap-2">
              <button
                data-testid={`step-indicator-${s.num}`}
                onClick={() => {
                  // Allow going back to completed steps (but not forward beyond current)
                  // Don't allow jumping back during draft loading or approving
                  if (s.num < step && !draftLoading && !approving) {
                    // If going back from step 5, discard draft
                    if (step === 5 && draftStoryId) {
                      deleteDoc(firestoreDoc(db, "stories", draftStoryId)).catch(() => {});
                      setDraftStoryId(null);
                      setEditedPages([]);
                      setDraftTitle("");
                      setDraftError("");
                    }
                    setStep(s.num);
                  }
                }}
                disabled={s.num > step || draftLoading || approving}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step > s.num
                    ? "bg-[#2A9D8F] text-white cursor-pointer hover:bg-[#248F82] hover:scale-110"
                    : step === s.num
                    ? "bg-[#FF9F1C] text-[#1E1B4B] shadow-lg glow-active cursor-default"
                    : "bg-[#F3E8FF] text-[#1E1B4B]/40 cursor-default"
                }`}
              >
                {step > s.num ? <Check className="w-4 h-4" strokeWidth={3} /> : s.num}
              </button>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  step > s.num ? "text-[#2A9D8F] cursor-pointer" : step >= s.num ? "text-[#1E1B4B]" : "text-[#1E1B4B]/40"
                }`}
                onClick={() => {
                  if (s.num < step && !draftLoading && !approving) {
                    if (step === 5 && draftStoryId) {
                      deleteDoc(firestoreDoc(db, "stories", draftStoryId)).catch(() => {});
                      setDraftStoryId(null);
                      setEditedPages([]);
                      setDraftTitle("");
                      setDraftError("");
                    }
                    setStep(s.num);
                  }
                }}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 rounded-full ${step > s.num ? "bg-[#2A9D8F]" : "bg-[#F3E8FF]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Back / Next — sticky below progress bar */}
        {step < 5 && (
          <div className="sticky top-[69px] z-40 -mx-6 px-6 py-3 mb-6 bg-[#FDFBF7]/90 backdrop-blur-md border-b border-[#F3E8FF] flex items-center justify-between">
            <Button
              data-testid="btn-step-back"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              disabled={step === 1 || approving}
              className="rounded-full text-[#1E1B4B]/60 hover:text-[#1E1B4B] disabled:opacity-30 h-9 px-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" strokeWidth={2.5} />
              Back
            </Button>
            <Button
              data-testid="btn-step-next"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={!canProceed()}
              className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-6 h-9 text-sm disabled:opacity-30"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-1.5" strokeWidth={2.5} />
            </Button>
          </div>
        )}

        {/* Step 1: Select Child Profile */}
        {step === 1 && (
          <div className="animate-fade-in-up" data-testid="step-select-profile">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                Who is this story for?
              </h2>
              <p className="text-[#1E1B4B]/60 mt-2">Select your child&apos;s profile or create a new one</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {profiles.map((p) => (
                <Card
                  key={p.profile_id}
                  data-testid={`profile-card-${p.profile_id}`}
                  className={`rounded-3xl border-2 cursor-pointer transition-all card-hover ${
                    selectedProfile?.profile_id === p.profile_id
                      ? "border-[#FF9F1C] glow-active bg-[#FF9F1C]/5"
                      : "border-[#F3E8FF] hover:border-[#FF9F1C]/40"
                  }`}
                  onClick={() => setSelectedProfile(p)}
                >
                  <CardContent className="p-6 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-[#3730A3]/10 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                      {(p.avatar_status === "pending" || p.avatar_status === "generating") ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-[#FF9F1C]/10 gap-1">
                          <Sparkles className="w-7 h-7 text-[#FF9F1C] animate-spin" strokeWidth={2} />
                          <span className="text-[9px] text-[#FF9F1C] font-semibold">Creating...</span>
                        </div>
                      ) : p.avatar_status === "failed" ? (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-[#E76F51]/10 gap-1">
                          <AlertCircle className="w-6 h-6 text-[#E76F51]" strokeWidth={2} />
                          <span className="text-[9px] text-[#E76F51] font-semibold">Failed</span>
                        </div>
                      ) : p.avatar_jpeg_url ? (
                        <BlurImage
                          src={p.avatar_jpeg_url}
                          alt={`${p.name}'s avatar`}
                          data-testid={`avatar-img-${p.profile_id}`}
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      ) : (p.photo_download_url || p.photo_url) ? (
                        <BlurImage
                          src={p.photo_download_url || p.photo_url}
                          alt={p.name}
                          className="w-full h-full object-cover rounded-2xl"
                        />
                      ) : (
                        <User className="w-7 h-7 text-[#3730A3]" strokeWidth={2} />
                      )}
                      {p.avatar_status === "completed" && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#2A9D8F] flex items-center justify-center border-2 border-white">
                          <Sparkles className="w-3 h-3 text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-[#1E1B4B] text-lg" style={{ fontFamily: "Fredoka" }}>{p.name}</h3>
                      <p className="text-sm text-[#1E1B4B]/50">
                        {p.avatar_status === "pending" || p.avatar_status === "generating"
                          ? "Creating avatar..."
                          : p.avatar_status === "failed"
                          ? "Avatar failed — tap retry"
                          : `Age ${p.age}${p.gender ? ` \u00b7 ${p.gender}` : ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      {p.avatar_status === "failed" && p.photo_url && (
                        <button
                          data-testid={`btn-retry-avatar-${p.profile_id}`}
                          onClick={(e) => handleRetryAvatar(e, p.profile_id)}
                          className="p-1.5 rounded-xl text-[#FF9F1C] hover:bg-[#FF9F1C]/10 transition-colors"
                          title="Retry avatar generation"
                        >
                          <RotateCcw className="w-4 h-4" strokeWidth={2} />
                        </button>
                      )}
                      {p.avatar_status !== "pending" && p.avatar_status !== "generating" && (
                        <button
                          data-testid={`btn-delete-photo-${p.profile_id}`}
                          onClick={(e) => handleDeletePhoto(e, p.profile_id)}
                          className="p-1.5 rounded-xl text-[#1E1B4B]/30 hover:text-[#E76F51] hover:bg-[#E76F51]/10 transition-colors"
                          title="Delete profile"
                        >
                          <Trash2 className="w-4 h-4" strokeWidth={2} />
                        </button>
                      )}
                      {selectedProfile?.profile_id === p.profile_id && (
                        <Check className="w-5 h-5 text-[#FF9F1C]" strokeWidth={3} />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* Add New Profile Card */}
              <Card
                data-testid="btn-add-profile"
                className="rounded-3xl border-2 border-dashed border-[#F3E8FF] cursor-pointer hover:border-[#FF9F1C]/40 transition-all card-hover"
                onClick={() => setShowNewProfile(true)}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#FF9F1C]/10 flex items-center justify-center flex-shrink-0">
                    <Plus className="w-7 h-7 text-[#FF9F1C]" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>Add New Profile</h3>
                    <p className="text-sm text-[#1E1B4B]/50">Create a child profile</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* New Profile Dialog */}
            <Dialog open={showNewProfile} onOpenChange={setShowNewProfile}>
              <DialogContent className="rounded-3xl border-2 border-[#F3E8FF] max-w-md" data-testid="dialog-new-profile">
                <DialogHeader>
                  <DialogTitle className="text-xl text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                    Create Child Profile
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-5 pt-2">
                  <div>
                    <Label className="text-[#1E1B4B] font-medium mb-2 block">Child&apos;s Name</Label>
                    <Input
                      data-testid="input-child-name"
                      value={newProfile.name}
                      onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                      placeholder="Enter name"
                      className="rounded-2xl border-[#F3E8FF] h-12"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-[#1E1B4B] font-medium mb-2 block">Age</Label>
                      <Input
                        data-testid="input-child-age"
                        type="number"
                        min={1}
                        max={12}
                        value={newProfile.age}
                        onChange={(e) => setNewProfile({ ...newProfile, age: e.target.value })}
                        placeholder="Age"
                        className="rounded-2xl border-[#F3E8FF] h-12"
                      />
                    </div>
                    <div>
                      <Label className="text-[#1E1B4B] font-medium mb-2 block">Gender (optional)</Label>
                      <div className="flex gap-3">
                        {["Boy", "Girl"].map((option) => (
                          <button
                            key={option}
                            type="button"
                            data-testid={`btn-gender-${option.toLowerCase()}`}
                            onClick={() => setNewProfile({ ...newProfile, gender: newProfile.gender === option ? "" : option })}
                            className={`flex-1 h-12 rounded-2xl border-2 font-medium transition-all ${
                              newProfile.gender === option
                                ? "border-[#FF9F1C] bg-[#FF9F1C]/10 text-[#FF9F1C]"
                                : "border-[#F3E8FF] text-[#1E1B4B]/50 hover:border-[#FF9F1C]/40"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[#1E1B4B] font-medium mb-2 block">Photo (for avatar generation)</Label>
                    {photoPreview ? (
                      <div className="flex items-center gap-4 p-3 rounded-2xl border-2 border-[#FF9F1C]/40 bg-[#FF9F1C]/5">
                        <img
                          src={photoPreview}
                          alt="Preview"
                          data-testid="photo-preview"
                          className="w-16 h-16 rounded-2xl object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#1E1B4B] truncate">{photoFile?.name}</p>
                          <p className="text-xs text-[#2A9D8F]">
                            <Sparkles className="w-3 h-3 inline mr-1" strokeWidth={2.5} />
                            Avatar will be generated from this photo
                          </p>
                        </div>
                        <button
                          onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                          className="text-[#1E1B4B]/40 hover:text-[#E76F51] text-lg font-bold"
                        >
                          x
                        </button>
                      </div>
                    ) : (
                      <label
                        data-testid="input-child-photo"
                        className="flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-[#F3E8FF] cursor-pointer hover:border-[#FF9F1C]/40 transition-colors"
                      >
                        <Upload className="w-5 h-5 text-[#1E1B4B]/40" strokeWidth={2} />
                        <span className="text-sm text-[#1E1B4B]/50">
                          Upload a photo to create an AI avatar
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePhotoChange}
                        />
                      </label>
                    )}
                  </div>
                  <Button
                    data-testid="btn-save-profile"
                    onClick={handleCreateProfile}
                    disabled={savingProfile}
                    className="w-full rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold min-h-[48px]"
                  >
                    {savingProfile ? "Saving..." : "Save Profile"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Step 2: Select Language */}
        {step === 2 && (
          <div className="animate-fade-in-up" data-testid="step-select-language">

            {/* Title */}
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                Choose a language
              </h2>
              <p className="text-[#1E1B4B]/60 mt-1 text-sm">The story will be written natively in this language</p>
            </div>

            {/* Language grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
              {LANGUAGES.map((lang) => (
                <Card
                  key={lang.code}
                  data-testid={`card-lang-${lang.code}`}
                  className={`rounded-2xl border-2 cursor-pointer transition-all card-hover ${
                    selectedLang?.code === lang.code
                      ? "border-[#FF9F1C] bg-[#FF9F1C]/5 glow-active"
                      : "border-[#F3E8FF] hover:border-[#FF9F1C]/40"
                  }`}
                  onClick={() => setSelectedLang(lang)}
                >
                  <CardContent className="p-3 text-center">
                    <div className={`text-xl mb-1 ${lang.font}`} style={{ fontFamily: lang.font ? undefined : "Fredoka" }}>
                      {lang.native}
                    </div>
                    <p className="text-xs text-[#1E1B4B]/50">{lang.name}</p>
                    {selectedLang?.code === lang.code && (
                      <Check className="w-4 h-4 text-[#FF9F1C] mx-auto mt-1" strokeWidth={3} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── Native name preview — shown as soon as a language is selected ── */}
            {selectedLang && (
              <div className="max-w-md mx-auto">
                {selectedLang.code === "en" ? (
                  /* English: just a confirmation pill */
                  <div className="flex items-center justify-center gap-3 p-5 rounded-3xl bg-[#F3E8FF]/60 border-2 border-[#FF9F1C]/30">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#FF9F1C] flex-shrink-0">
                      {selectedProfile?.avatar_jpeg_url ? (
                        <BlurImage src={selectedProfile.avatar_jpeg_url} alt={selectedProfile.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[#FF9F1C]/10 flex items-center justify-center">
                          <span className="text-lg font-bold text-[#FF9F1C]">{selectedProfile?.name?.[0]}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                        {selectedProfile?.name}
                      </p>
                      <p className="text-xs text-[#2A9D8F] font-semibold mt-0.5">Story will be in English ✓</p>
                    </div>
                  </div>
                ) : (
                  /* Non-English: big native name preview + edit field */
                  <div className="rounded-3xl border-2 border-[#FF9F1C]/40 bg-white overflow-hidden">
                    {/* Big preview strip */}
                    <div className="bg-gradient-to-r from-[#FF9F1C]/10 to-[#3730A3]/10 px-6 py-5 flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#FF9F1C] flex-shrink-0">
                        {selectedProfile?.avatar_jpeg_url ? (
                          <BlurImage src={selectedProfile.avatar_jpeg_url} alt={selectedProfile.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-[#FF9F1C]/10 flex items-center justify-center">
                            <span className="text-xl font-bold text-[#FF9F1C]">{selectedProfile?.name?.[0]}</span>
                          </div>
                        )}
                      </div>
                      {/* Name in native script — the KEY info */}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-[#1E1B4B]/40 uppercase tracking-wider mb-0.5">
                          {selectedProfile?.name} in {selectedLang.name}
                        </p>
                        {transliterating ? (
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[#FF9F1C] animate-spin flex-shrink-0" strokeWidth={2} />
                            <span className="text-lg text-[#FF9F1C] font-medium animate-pulse">Transliterating…</span>
                          </div>
                        ) : nativeChildName ? (
                          <p className={`text-3xl font-bold text-[#1E1B4B] leading-tight ${selectedLang.font}`}>
                            {nativeChildName}
                          </p>
                        ) : (
                          <p className="text-lg text-[#1E1B4B]/30 italic">Type name below…</p>
                        )}
                        {transliterationDone && !transliterating && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-[#2A9D8F] font-semibold mt-1">
                            <Check className="w-3 h-3" strokeWidth={3} />
                            AI suggested — please verify
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Edit field */}
                    <div className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-3.5 h-3.5 text-[#3730A3]" strokeWidth={2.5} />
                        <span className="text-xs font-semibold text-[#1E1B4B]/70">
                          Edit native script name
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                          <Input
                            data-testid="input-native-child-name"
                            value={nativeChildName}
                            onChange={(e) => { setNativeChildName(e.target.value); setTransliterationDone(false); }}
                            placeholder={transliterating ? "Transliterating..." : `${selectedProfile?.name || "Name"} in ${selectedLang.name}`}
                            disabled={transliterating}
                            className={`rounded-xl border-2 border-[#F3E8FF] focus:border-[#FF9F1C] h-12 text-center text-lg ${selectedLang.font} ${
                              transliterating ? "animate-pulse bg-[#F3E8FF]/50" : "bg-[#FDFBF7]"
                            }`}
                          />
                        </div>
                      </div>
                      {/* Tip */}
                      <p className="text-xs text-[#1E1B4B]/40 mt-3 leading-relaxed">
                        {transliterationDone
                          ? "AI suggested — please review and edit if needed. Leave blank to use the English name."
                          : "Enter your child's name in native script. Leave blank to use the English name."
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Quick Templates + Interests */}
        {step === 3 && (
          <div className="animate-fade-in-up" data-testid="step-select-interests">
            <div className="text-center mb-6">
              <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                Pick a story for {selectedProfile?.name}
              </h2>
              <p className="text-[#1E1B4B]/60 mt-2">
                Choose a ready-made theme or build your own below
              </p>
            </div>

            {/* Age-filtered Quick Templates with category tabs */}
            {(() => {
              const childAge = selectedProfile?.age || 5;
              const langCode = selectedLang?.code || "en";

              // Language filter: show templates that match the selected language OR are pan-Indian
              const langMatch = (t) => !t.langs || t.langs.includes("all") || t.langs.includes(langCode);

              const allAge = STORY_TEMPLATES.filter(t => childAge >= t.ageMin && childAge <= t.ageMax && langMatch(t));
              const filtered = templateFilter === "all"
                ? allAge
                : allAge.filter(t => t.category === templateFilter);

              // Sort: language-specific templates first, then pan-Indian
              const sortByRegion = (a, b) => {
                const aRegional = a.langs && !a.langs.includes("all") && a.langs.includes(langCode);
                const bRegional = b.langs && !b.langs.includes("all") && b.langs.includes(langCode);
                if (aRegional && !bRegional) return -1;
                if (!aRegional && bRegional) return 1;
                return 0;
              };
              filtered.sort(sortByRegion);

              const otherAge = STORY_TEMPLATES.filter(t => (childAge < t.ageMin || childAge > t.ageMax) && langMatch(t));
              const otherFiltered = templateFilter === "all"
                ? otherAge
                : otherAge.filter(t => t.category === templateFilter);

              // Count regional templates for the label
              const regionalCount = filtered.filter(t => t.langs && !t.langs.includes("all") && t.langs.includes(langCode)).length;

              return (
                <>
                  {/* Category tabs */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {TEMPLATE_CATEGORIES.map((cat) => {
                      const count = cat.id === "all"
                        ? allAge.length
                        : allAge.filter(t => t.category === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          data-testid={`tab-${cat.id}`}
                          onClick={() => setTemplateFilter(cat.id)}
                          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                            templateFilter === cat.id
                              ? "bg-[#FF9F1C] text-[#1E1B4B] shadow-md"
                              : "bg-white text-[#1E1B4B]/60 border-2 border-[#F3E8FF] hover:border-[#FF9F1C]/40"
                          }`}
                        >
                          {cat.label}
                          <span className={`ml-1.5 text-xs ${templateFilter === cat.id ? "text-[#1E1B4B]/70" : "text-[#1E1B4B]/30"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex justify-end mb-3">
                    <button
                      data-testid="btn-surprise-me"
                      onClick={() => {
                        const pool = filtered.length > 0 ? filtered : allAge;
                        if (pool.length === 0) return;
                        const random = pool[Math.floor(Math.random() * pool.length)];
                        setSelectedTemplate(random.id);
                        setSelectedInterests(random.interests);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3730A3] hover:text-[#FF9F1C] transition-colors"
                    >
                      <Shuffle className="w-4 h-4" strokeWidth={2.5} />
                      Surprise me
                    </button>
                  </div>

                  {/* Recommended templates */}
                  {filtered.length > 0 && (
                    <div className="mb-6">
                      <p className="text-xs font-bold text-[#FF9F1C] uppercase tracking-wider mb-3">
                        {regionalCount > 0
                          ? `${selectedLang?.name} region + pan-India \u00b7 Age ${childAge}`
                          : `Recommended for age ${childAge}`}
                        {templateFilter !== "all" && ` \u00b7 ${TEMPLATE_CATEGORIES.find(c => c.id === templateFilter)?.label}`}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filtered.map((t) => {
                          const Icon = t.icon;
                          const isActive = selectedTemplate === t.id;
                          return (
                            <Card
                              key={t.id}
                              data-testid={`template-${t.id}`}
                              className={`rounded-2xl border-2 cursor-pointer transition-all card-hover ${
                                isActive
                                  ? "border-[#FF9F1C] bg-[#FF9F1C]/5 glow-active"
                                  : "border-[#F3E8FF] hover:border-[#FF9F1C]/40"
                              }`}
                              onClick={() => {
                                setSelectedTemplate(isActive ? null : t.id);
                                setSelectedInterests(isActive ? [] : t.interests);
                              }}
                            >
                              <CardContent className="p-4 flex items-center gap-3">
                                <div
                                  className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                  style={{ backgroundColor: t.color + "15" }}
                                >
                                  <Icon className="w-5 h-5" style={{ color: t.color }} strokeWidth={2.5} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-[#1E1B4B] text-sm leading-tight" style={{ fontFamily: "Fredoka" }}>
                                      {t.title}
                                    </h4>
                                    {t.langs && !t.langs.includes("all") && (
                                      <span className="text-[9px] font-bold uppercase tracking-wider bg-[#2A9D8F]/10 text-[#2A9D8F] px-1.5 py-0.5 rounded-full flex-shrink-0">
                                        {selectedLang?.name}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-[#1E1B4B]/50 mt-0.5 leading-snug">{t.desc}</p>
                                </div>
                                {isActive && <Check className="w-5 h-5 text-[#FF9F1C] flex-shrink-0" strokeWidth={3} />}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {otherFiltered.length > 0 && (
                    <div className="mb-8">
                      <p className="text-xs font-bold text-[#1E1B4B]/30 uppercase tracking-wider mb-3">
                        More themes (other ages)
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {otherFiltered.map((t) => {
                          const Icon = t.icon;
                          const isActive = selectedTemplate === t.id;
                          return (
                            <div
                              key={t.id}
                              data-testid={`template-${t.id}`}
                              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                isActive
                                  ? "border-[#FF9F1C] bg-[#FF9F1C]/5"
                                  : "border-[#F3E8FF]/60 hover:border-[#FF9F1C]/30 opacity-70 hover:opacity-100"
                              }`}
                              onClick={() => {
                                setSelectedTemplate(isActive ? null : t.id);
                                setSelectedInterests(isActive ? [] : t.interests);
                              }}
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: t.color + "10" }}
                              >
                                <Icon className="w-4 h-4" style={{ color: t.color }} strokeWidth={2.5} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>{t.title}</p>
                                <p className="text-[10px] text-[#1E1B4B]/40">Ages {t.ageMin}–{t.ageMax}</p>
                              </div>
                              {isActive && <Check className="w-4 h-4 text-[#FF9F1C] flex-shrink-0" strokeWidth={3} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div className="flex-1 h-px bg-[#F3E8FF]" />
              <span className="text-xs font-bold text-[#1E1B4B]/30 uppercase tracking-wider">or pick your own</span>
              <div className="flex-1 h-px bg-[#F3E8FF]" />
            </div>

            {/* Manual interest pills */}
            <div className="flex flex-wrap gap-3 justify-center mb-6">
              {INTEREST_OPTIONS.map((interest) => {
                const Icon = interest.icon;
                const isSelected = selectedInterests.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    data-testid={`interest-${interest.id}`}
                    onClick={() => {
                      setSelectedTemplate(null); // clear template when manual picking
                      toggleInterest(interest.id);
                    }}
                    className={`pill-tag inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold border-2 transition-all ${
                      isSelected
                        ? "active border-[#FF9F1C]"
                        : "border-[#F3E8FF] text-[#1E1B4B]/70 hover:border-[#FF9F1C]/40 bg-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={2.5} />
                    {interest.label}
                  </button>
                );
              })}
            </div>
            {/* Custom interest */}
            <div className="flex gap-3 max-w-md mx-auto">
              <Input
                data-testid="input-custom-interest"
                value={customInterest}
                onChange={(e) => setCustomInterest(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomInterest()}
                placeholder="Add custom interest..."
                className="rounded-full border-[#F3E8FF] h-12"
              />
              <Button
                data-testid="btn-add-interest"
                onClick={addCustomInterest}
                variant="outline"
                className="rounded-full border-[#F3E8FF] text-[#1E1B4B] h-12 px-6"
                disabled={!customInterest.trim()}
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
              </Button>
            </div>
            {/* Custom interests display */}
            {selectedInterests.filter((i) => !INTEREST_OPTIONS.find((o) => o.id === i)).length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {selectedInterests
                  .filter((i) => !INTEREST_OPTIONS.find((o) => o.id === i))
                  .map((ci) => (
                    <span
                      key={ci}
                      className="pill-tag active inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold border-2 border-[#FF9F1C]"
                    >
                      {ci}
                      <button
                        onClick={() => setSelectedInterests((prev) => prev.filter((i) => i !== ci))}
                        className="ml-1 text-[#1E1B4B]/50 hover:text-[#E76F51]"
                      >
                        x
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <p className="text-center text-sm text-[#1E1B4B]/40 mt-4">
              {selectedInterests.length} selected
              {selectedTemplate && (
                <span className="ml-2 text-[#2A9D8F] font-medium">
                  ({STORY_TEMPLATES.find(t => t.id === selectedTemplate)?.title})
                </span>
              )}
            </p>

            {/* Custom Incident */}
            <div className="max-w-md mx-auto mt-8">
              <div className="rounded-3xl border-2 border-dashed border-[#F3E8FF] hover:border-[#FF9F1C]/40 transition-colors p-5 bg-white">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-[#FF9F1C]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-[#FF9F1C]" strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-[#1E1B4B] text-sm" style={{ fontFamily: "Fredoka" }}>
                      Add a special moment <span className="text-[#1E1B4B]/40 font-normal">(optional)</span>
                    </p>
                    <p className="text-xs text-[#1E1B4B]/50 mt-0.5">
                      Something that happened today — we'll weave it into a constructive story
                    </p>
                  </div>
                </div>
                <textarea
                  value={customIncident}
                  onChange={(e) => setCustomIncident(e.target.value)}
                  placeholder={`e.g. "${selectedProfile?.name} fell down today and cried" or "got upset sharing toys"`}
                  rows={3}
                  className="w-full rounded-2xl border-2 border-[#F3E8FF] focus:border-[#FF9F1C] focus:outline-none px-4 py-3 text-sm text-[#1E1B4B] placeholder:text-[#1E1B4B]/30 resize-none transition-colors bg-[#FDFBF7]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Page Count */}
        {step === 4 && (
          <div className="animate-fade-in-up" data-testid="step-select-pages">
            <div className="text-center mb-8">
              <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                How long should the story be?
              </h2>
              <p className="text-[#1E1B4B]/60 mt-2">Choose the number of pages including cover and back cover</p>
            </div>
            <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto">
              {[
                { count: 6, label: "Short", desc: "4 story pages" },
                { count: 8, label: "Standard", desc: "6 story pages", recommended: true },
                { count: 10, label: "Long", desc: "8 story pages" },
                { count: 12, label: "Extended", desc: "10 story pages" },
              ].map((opt) => (
                <Card
                  key={opt.count}
                  data-testid={`card-pages-${opt.count}`}
                  className={`rounded-2xl border-2 cursor-pointer transition-all card-hover ${
                    pageCount === opt.count
                      ? "border-[#FF9F1C] bg-[#FF9F1C]/5 glow-active"
                      : "border-[#F3E8FF] hover:border-[#FF9F1C]/40"
                  }`}
                  onClick={() => setPageCount(opt.count)}
                >
                  <CardContent className="p-6 text-center">
                    <div className="text-3xl font-bold text-[#1E1B4B] mb-1" style={{ fontFamily: "Fredoka" }}>
                      {opt.count}
                    </div>
                    <div className="text-sm font-semibold text-[#1E1B4B]">{opt.label}</div>
                    <div className="text-xs text-[#1E1B4B]/50 mt-1">{opt.desc}</div>
                    {opt.recommended && (
                      <div className="mt-2 text-xs text-[#2A9D8F] font-semibold">Recommended</div>
                    )}
                    {pageCount === opt.count && (
                      <Check className="w-5 h-5 text-[#FF9F1C] mx-auto mt-2" strokeWidth={3} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Review & Edit Story */}
        {step === 5 && (
          <div className="animate-fade-in-up" data-testid="step-review-generate">
            {/* Loading state */}
            {draftLoading && (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                    Writing your story...
                  </h2>
                  <p className="text-[#1E1B4B]/50 mt-1 text-sm">This usually takes 1–2 minutes</p>
                </div>

                {/* Step progress */}
                <div className="max-w-md mx-auto mb-10 space-y-3">
                  {LOADING_STEPS.map((s, i) => {
                    const isDone = i < loadingStep;
                    const isActive = i === loadingStep;
                    return (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-500 ${
                          isActive ? "bg-[#FF9F1C]/10 border-2 border-[#FF9F1C]/30" :
                          isDone  ? "bg-[#2A9D8F]/6 border-2 border-[#2A9D8F]/20" :
                                    "bg-white border-2 border-[#F3E8FF] opacity-40"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                          isDone  ? "bg-[#2A9D8F]" :
                          isActive ? "bg-[#FF9F1C]" :
                                     "bg-[#F3E8FF]"
                        }`}>
                          {isDone ? (
                            <Check className="w-4 h-4 text-white" strokeWidth={2.5} />
                          ) : isActive ? (
                            <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" strokeWidth={2} />
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-[#1E1B4B]/20" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${
                            isActive ? "text-[#1E1B4B]" :
                            isDone  ? "text-[#2A9D8F]" :
                                      "text-[#1E1B4B]/40"
                          }`}>{s.label}</p>
                          {isActive && (
                            <p className="text-xs text-[#1E1B4B]/50 mt-0.5">{s.sub}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Page skeleton placeholders */}
                <div className="space-y-4 max-w-2xl mx-auto">
                  {Array.from({ length: Math.min(pageCount, 4) }).map((_, i) => (
                    <div key={i} className="rounded-3xl border-2 border-[#F3E8FF] bg-white p-5 animate-pulse">
                      <div className="h-3 bg-[#F3E8FF] rounded-full w-24 mb-4" />
                      <div className="space-y-2">
                        <div className="h-3 bg-[#F3E8FF] rounded-full w-full" />
                        <div className="h-3 bg-[#F3E8FF] rounded-full w-5/6" />
                        <div className="h-3 bg-[#F3E8FF] rounded-full w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Error state */}
            {draftError && !draftLoading && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-[#E76F51]/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">✕</span>
                </div>
                <p className="text-[#E76F51] font-medium mb-6">{draftError}</p>
                <Button
                  onClick={() => { setDraftStoryId(null); setDraftError(""); handleGenerateDraft(); }}
                  className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold px-8"
                >
                  Try Again
                </Button>
              </div>
            )}

            {/* Edit state */}
            {!draftLoading && !draftError && editedPages.length > 0 && (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl tracking-tight font-medium text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                    Review & Edit Your Story
                  </h2>
                  {draftTitle && (
                    <p className="font-native text-lg text-[#3730A3] font-medium mt-2">{draftTitle}</p>
                  )}
                  {/* Quick action buttons */}
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button
                      data-testid="btn-change-theme"
                      onClick={() => {
                        // Go back to interests step — discard draft
                        if (draftStoryId) {
                          deleteDoc(firestoreDoc(db, "stories", draftStoryId)).catch(() => {});
                        }
                        setDraftStoryId(null);
                        setEditedPages([]);
                        setDraftTitle("");
                        setStep(3);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3730A3] hover:text-[#FF9F1C] transition-colors bg-[#3730A3]/5 hover:bg-[#FF9F1C]/10 rounded-full px-4 py-2"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                      Change Theme
                    </button>
                    <button
                      data-testid="btn-change-language"
                      onClick={() => {
                        if (draftStoryId) {
                          deleteDoc(firestoreDoc(db, "stories", draftStoryId)).catch(() => {});
                        }
                        setDraftStoryId(null);
                        setEditedPages([]);
                        setDraftTitle("");
                        setStep(2);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3730A3] hover:text-[#FF9F1C] transition-colors bg-[#3730A3]/5 hover:bg-[#FF9F1C]/10 rounded-full px-4 py-2"
                    >
                      <Globe className="w-3.5 h-3.5" strokeWidth={2.5} />
                      Change Language
                    </button>
                    <button
                      data-testid="btn-regenerate-draft"
                      onClick={() => {
                        if (draftStoryId) {
                          deleteDoc(firestoreDoc(db, "stories", draftStoryId)).catch(() => {});
                        }
                        setDraftStoryId(null);
                        setEditedPages([]);
                        setDraftTitle("");
                        setDraftError("");
                        // Re-trigger draft
                        setTimeout(() => handleGenerateDraft(), 100);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2A9D8F] hover:text-[#FF9F1C] transition-colors bg-[#2A9D8F]/5 hover:bg-[#FF9F1C]/10 rounded-full px-4 py-2"
                    >
                      <Shuffle className="w-3.5 h-3.5" strokeWidth={2.5} />
                      Regenerate Story
                    </button>
                  </div>
                </div>

                <p className="text-[#1E1B4B]/50 mt-0 mb-6 text-sm text-center">
                  Edit any page text below, then approve to create the illustrated storybook
                </p>

                <div className="space-y-4 max-w-2xl mx-auto">
                  {editedPages.map((page, idx) => {
                    const pageIdx = typeof page === "object" ? page.page : idx;
                    const isBackCover = pageIdx === pageCount - 1;
                    const isCover = pageIdx === 0;
                    const label = isCover ? "Cover" : isBackCover ? "Back Cover" : `Page ${pageIdx}`;

                    return (
                      <div
                        key={pageIdx}
                        className={`rounded-3xl border-2 p-5 bg-white ${
                          isBackCover ? "border-[#F3E8FF] opacity-70" : "border-[#F3E8FF] hover:border-[#FF9F1C]/30 transition-colors"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-3">
                          <span className={`inline-flex items-center justify-center rounded-full px-3 py-0.5 text-xs font-bold ${
                            isCover
                              ? "bg-[#FF9F1C]/15 text-[#FF9F1C]"
                              : isBackCover
                              ? "bg-[#F3E8FF] text-[#1E1B4B]/40"
                              : "bg-[#3730A3]/10 text-[#3730A3]"
                          }`}>
                            {label}
                          </span>
                          {isBackCover && (
                            <span className="text-xs text-[#1E1B4B]/30">Branding — not editable</span>
                          )}
                        </div>
                        <textarea
                          value={typeof page === "object" ? page.text || "" : page}
                          onChange={(e) => {
                            if (isBackCover) return;
                            setEditedPages((prev) =>
                              prev.map((p, i) =>
                                i === idx
                                  ? typeof p === "object" ? { ...p, text: e.target.value } : e.target.value
                                  : p
                              )
                            );
                          }}
                          readOnly={isBackCover}
                          rows={isCover ? 2 : 4}
                          className={`w-full rounded-2xl border-2 px-4 py-3 text-sm text-[#1E1B4B] resize-none transition-colors ${selectedLang?.font || ""} ${
                            isBackCover
                              ? "border-transparent bg-[#FDFBF7] text-[#1E1B4B]/40 cursor-default"
                              : "border-[#F3E8FF] focus:border-[#FF9F1C] focus:outline-none bg-[#FDFBF7]"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="text-center mt-10">
                  {/* Price display */}
                  {paymentsEnabled && (
                    <div className="mb-4">
                      <span className="text-3xl font-bold text-[#1E1B4B]" style={{ fontFamily: "Fredoka" }}>
                        ₹{PRICING_TABLE[pageCount] || pageCount * 13}
                      </span>
                      <span className="text-sm text-[#1E1B4B]/50 ml-2">
                        for {pageCount} pages (₹{Math.round((PRICING_TABLE[pageCount] || pageCount * 13) / pageCount)}/page)
                      </span>
                    </div>
                  )}
                  <Button
                    data-testid="btn-approve-story"
                    onClick={handleApprove}
                    disabled={approving}
                    className="rounded-full bg-[#FF9F1C] hover:bg-[#E88A12] text-[#1E1B4B] font-bold text-lg px-10 min-h-[56px] shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
                  >
                    {approving ? (
                      <>
                        <Sparkles className="w-5 h-5 mr-2 animate-spin" strokeWidth={2.5} />
                        {paymentsEnabled ? "Processing Payment..." : "Creating Storybook..."}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5 mr-2" strokeWidth={2.5} />
                        {paymentsEnabled
                          ? `Pay ₹${PRICING_TABLE[pageCount] || pageCount * 13} & Create Storybook`
                          : "Create Storybook"}
                      </>
                    )}
                  </Button>
                  {paymentsEnabled && (
                    <p className="text-xs text-[#1E1B4B]/40 mt-3">
                      Secure payment via Razorpay. Illustrations generated after payment.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* bottom spacer so last card isn't hidden under nothing */}
        <div className="h-8" />
      </div>
    </div>
  );
}
