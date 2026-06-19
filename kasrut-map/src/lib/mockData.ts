import type { MapRestaurant } from '@/types'

export const MOCK_RESTAURANTS: MapRestaurant[] = [
  // Jerusalem
  {
    id: 'm1', name: 'המאפייה העתיקה', address: "רח' ירושלים 17", city: 'Jerusalem',
    lat: 31.7796, lng: 35.2257, foodType: 'dairy', category: 'bakery', kashrutLevel: 'mehadrin',
    hechsher: 'הרה"ר ירושלים', phone: '02-623-1111',
    hours: 'א׳–ה׳ 8:00–21:00, ו׳ 8:00–14:00',
  },
  {
    id: 'm2', name: 'מסעדת הגריל', address: "רח' יפו 42", city: 'Jerusalem',
    lat: 31.7839, lng: 35.2129, foodType: 'meat', category: 'restaurant', kashrutLevel: 'badatz',
    hechsher: 'בד"ץ עדה החרדית', phone: '02-624-2222',
    hours: 'א׳–ה׳ 12:00–23:00, מוצ"ש–ראש',
  },
  {
    id: 'm3', name: 'בית קפה הרובע', address: "רח' הרובע היהודי 5", city: 'Jerusalem',
    lat: 31.7757, lng: 35.2340, foodType: 'pareve', category: 'cafe', kashrutLevel: 'mehadrin',
    hechsher: 'הרה"ר ירושלים', phone: '02-626-3333',
    hours: 'א׳–ה׳ 9:00–20:00, ו׳ 9:00–13:00',
  },
  {
    id: 'm4', name: 'פלאפל בן-יהודה', address: "רח' בן יהודה 12", city: 'Jerusalem',
    lat: 31.7812, lng: 35.2168, foodType: 'pareve', category: 'restaurant', kashrutLevel: 'regular',
    hechsher: 'רב"ד ירושלים', phone: '052-444-5555',
    hours: 'א׳–ה׳ 10:00–22:00',
  },
  {
    id: 'm5', name: 'שוק מחנה יהודה', address: "שוק מחנה יהודה", city: 'Jerusalem',
    lat: 31.7843, lng: 35.2117, foodType: 'takeaway', category: 'restaurant', kashrutLevel: 'regular',
    hechsher: 'רב"ד ירושלים', hours: 'א׳–ה׳ 8:00–19:00, ו׳ 8:00–14:00',
  },
  {
    id: 'm6', name: 'מסעדת שמשון', address: "רח' שמשון 8", city: 'Jerusalem',
    lat: 31.7720, lng: 35.2310, foodType: 'meat', category: 'restaurant', kashrutLevel: 'mehadrin',
    hechsher: 'מהדרין ירושלים', phone: '02-671-6666',
    hours: 'א׳–ה׳ 12:00–22:00',
  },

  // Haifa
  {
    id: 'm7', name: 'פיצה חיפה', address: "רח' הרצל 33", city: 'Haifa',
    lat: 32.8156, lng: 34.9893, foodType: 'dairy', category: 'restaurant', kashrutLevel: 'regular',
    hechsher: 'רב"ד חיפה', phone: '04-855-7777',
    hours: 'א׳–ה׳ 11:00–23:00',
  },
  {
    id: 'm8', name: 'שוק הבשר', address: "שוק תלפיות 1", city: 'Haifa',
    lat: 32.8073, lng: 34.9942, foodType: 'meat', category: 'restaurant', kashrutLevel: 'mehadrin',
    hechsher: 'מהדרין חיפה', phone: '04-851-8888',
    hours: 'א׳–ה׳ 10:00–21:00, ו׳ 9:00–13:00',
  },
  {
    id: 'm9', name: 'קפה כרמל', address: "רח' הכרמל 5", city: 'Haifa',
    lat: 32.7963, lng: 34.9892, foodType: 'pareve', category: 'cafe', kashrutLevel: 'regular',
    hechsher: 'רב"ד חיפה', hours: 'כל יום 8:00–22:00',
  },

  // Tel Aviv
  {
    id: 'm10', name: 'הים קפה', address: "טיילת תל אביב 1", city: 'Tel Aviv',
    lat: 32.0669, lng: 34.7647, foodType: 'dairy', category: 'cafe', kashrutLevel: 'regular',
    hechsher: 'רב"ד ת"א', phone: '03-544-1010',
    hours: 'כל יום 8:00–23:00',
  },
  {
    id: 'm11', name: 'שיפוד ים תיכון', address: "רח' דיזנגוף 77", city: 'Tel Aviv',
    lat: 32.0784, lng: 34.7736, foodType: 'meat', category: 'restaurant', kashrutLevel: 'badatz',
    hechsher: 'בד"ץ ישראל', phone: '03-523-1111',
    hours: 'א׳–ה׳ 12:00–24:00',
  },
  {
    id: 'm12', name: 'סושי על הדרך', address: "רח' רוטשילד 12", city: 'Tel Aviv',
    lat: 32.0631, lng: 34.7739, foodType: 'takeaway', category: 'restaurant', kashrutLevel: 'regular',
    hechsher: 'רב"ד ת"א', phone: '03-560-1212',
    hours: 'א׳–ה׳ 11:00–22:00',
  },
  {
    id: 'm13', name: 'שוק הנמל', address: "נמל ת\"א", city: 'Tel Aviv',
    lat: 32.0992, lng: 34.7742, foodType: 'pareve', category: 'restaurant', kashrutLevel: 'mehadrin',
    hechsher: 'מהדרין ת"א', hours: 'א׳–ה׳ 10:00–22:00',
  },

  // Tzfat
  {
    id: 'm14', name: 'מסעדת הגורמה', address: "רח' יפו 42", city: 'Tzfat',
    lat: 32.9641, lng: 35.4956, foodType: 'meat', category: 'restaurant', kashrutLevel: 'mehadrin',
    hechsher: 'בד"ץ ק. צפת', phone: '04-697-1414',
    hours: 'א׳–ה׳ 12:00–22:00',
  },
  {
    id: 'm15', name: 'בית לחם גליל', address: "רח' ירושלים 3", city: 'Tzfat',
    lat: 32.9666, lng: 35.4970, foodType: 'dairy', category: 'bakery', kashrutLevel: 'regular',
    hechsher: 'רב"ד צפת', hours: 'א׳–ה׳ 8:00–20:00, ו׳ 8:00–14:00',
  },

  // Tiberias
  {
    id: 'm16', name: 'מלון כנרות', address: "רח' זייד 9", city: 'Tiberias',
    lat: 32.7944, lng: 35.5271, foodType: 'dairy', category: 'restaurant', kashrutLevel: 'regular',
    hechsher: 'רב"ד טבריה', phone: '04-672-1616',
    hours: 'כל יום 7:00–22:00',
  },
  {
    id: 'm17', name: 'דגי הכנרת', address: "טיילת טבריה 20", city: 'Tiberias',
    lat: 32.7912, lng: 35.5247, foodType: 'pareve', category: 'restaurant', kashrutLevel: 'mehadrin',
    hechsher: 'מהדרין טבריה', phone: '04-673-1717',
    hours: 'א׳–ה׳ 12:00–22:00',
  },

  // Bnei Brak
  {
    id: 'm18', name: 'מאכלי בני ברק', address: "רח' חזון איש 5", city: 'Bnei Brak',
    lat: 32.0851, lng: 34.8285, foodType: 'meat', category: 'restaurant', kashrutLevel: 'badatz',
    hechsher: 'בד"ץ בני ברק', phone: '03-618-1818',
    hours: 'א׳–ה׳ 10:00–22:00',
  },
  {
    id: 'm19', name: 'מאפיית הזהב', address: "רח' רבי עקיבא 60", city: 'Bnei Brak',
    lat: 32.0832, lng: 34.8314, foodType: 'takeaway', category: 'bakery', kashrutLevel: 'mehadrin',
    hechsher: 'בד"ץ מהדרין', hours: 'א׳–ה׳ 6:00–21:00, ו׳ 6:00–14:00',
  },
]
