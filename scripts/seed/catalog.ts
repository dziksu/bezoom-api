export const categories = [
  'ARTS_AND_CULTURE',
  'ENTERTAINMENT',
  'SPORT_AND_RECREATION',
  'EDUCATION_AND_DEVELOPMENT',
  'SOCIAL_MEETUPS',
  'FESTIVALS_AND_FAIRS',
  'TRADE_AND_MARKETS',
  'FAMILY_AND_KIDS',
  'BUSINESS_AND_CAREER',
  'COMMUNITY_AND_ACTIVISM',
  'MUSIC_AND_NIGHTLIFE',
  'HEALTH_AND_WELLNESS',
  'FOOD_AND_CULINARY'
] as const;

export type EventCategory = (typeof categories)[number];

export interface CityDefinition {
  name: string;
  latitude: number;
  longitude: number;
  weight: number;
  districts: string[];
  venues: string[];
}

export const cities: CityDefinition[] = [
  {
    name: 'Warszawa',
    latitude: 52.2297,
    longitude: 21.0122,
    weight: 22,
    districts: ['Śródmieście', 'Mokotów', 'Praga-Północ', 'Wola', 'Żoliborz', 'Ursynów'],
    venues: ['Bulwary Wiślane', 'Hala Koszyki', 'Fort Bema', 'Plac Konesera', 'Pole Mokotowskie']
  },
  {
    name: 'Kraków',
    latitude: 50.0647,
    longitude: 19.945,
    weight: 11,
    districts: ['Stare Miasto', 'Kazimierz', 'Podgórze', 'Nowa Huta', 'Dębniki'],
    venues: ['Błonia', 'Forum Przestrzenie', 'Zabłocie', 'Rynek Podgórski', 'Park Jordana']
  },
  {
    name: 'Wrocław',
    latitude: 51.1079,
    longitude: 17.0385,
    weight: 9,
    districts: ['Stare Miasto', 'Nadodrze', 'Krzyki', 'Biskupin', 'Psie Pole'],
    venues: ['Wyspa Słodowa', 'Hala Stulecia', 'Park Południowy', 'Czasoprzestrzeń', 'Plac Społeczny']
  },
  {
    name: 'Poznań',
    latitude: 52.4064,
    longitude: 16.9252,
    weight: 8,
    districts: ['Jeżyce', 'Łazarz', 'Wilda', 'Stare Miasto', 'Sołacz'],
    venues: ['Stary Browar', 'Cytadela', 'Nocny Targ Towarzyski', 'KontenerART', 'Park Sołacki']
  },
  {
    name: 'Gdańsk',
    latitude: 54.352,
    longitude: 18.6466,
    weight: 7,
    districts: ['Śródmieście', 'Wrzeszcz', 'Oliwa', 'Przymorze', 'Brzeźno'],
    venues: ['Stocznia', '100cznia', 'Park Oliwski', 'Plaża Brzeźno', 'Ołowianka']
  },
  {
    name: 'Łódź',
    latitude: 51.7592,
    longitude: 19.456,
    weight: 7,
    districts: ['Śródmieście', 'Polesie', 'Bałuty', 'Księży Młyn', 'Widzew'],
    venues: ['OFF Piotrkowska', 'Manufaktura', 'Monopolis', 'Park Źródliska', 'EC1']
  },
  {
    name: 'Katowice',
    latitude: 50.2649,
    longitude: 19.0238,
    weight: 6,
    districts: ['Śródmieście', 'Koszutka', 'Ligota', 'Nikiszowiec', 'Brynów'],
    venues: ['Strefa Kultury', 'Dolina Trzech Stawów', 'Nikiszowiec', 'Spodek', 'Park Kościuszki']
  },
  {
    name: 'Szczecin',
    latitude: 53.4285,
    longitude: 14.5528,
    weight: 5,
    districts: ['Centrum', 'Pogodno', 'Niebuszewo', 'Łasztownia', 'Jasne Błonia'],
    venues: ['Łasztownia', 'Jasne Błonia', 'Wały Chrobrego', 'Różanka', 'Bulwary']
  },
  {
    name: 'Lublin',
    latitude: 51.2465,
    longitude: 22.5684,
    weight: 5,
    districts: ['Stare Miasto', 'Śródmieście', 'Czechów', 'Wieniawa', 'Bronowice'],
    venues: ['Błonia pod Zamkiem', 'Centrum Spotkania Kultur', 'Plac Litewski', 'Park Ludowy']
  },
  {
    name: 'Gdynia',
    latitude: 54.5189,
    longitude: 18.5305,
    weight: 4,
    districts: ['Śródmieście', 'Orłowo', 'Redłowo', 'Kamienna Góra', 'Chylonia'],
    venues: ['Skwer Kościuszki', 'Plaża Orłowo', 'Park Kolibki', 'Góra Gradowa', 'Polanka Redłowska']
  },
  {
    name: 'Bydgoszcz',
    latitude: 53.1235,
    longitude: 18.0084,
    weight: 4,
    districts: ['Śródmieście', 'Szwederowo', 'Fordon', 'Bocianowo'],
    venues: ['Wyspa Młyńska', 'Myślęcinek', 'Młyny Rothera', 'Stary Rynek']
  },
  {
    name: 'Białystok',
    latitude: 53.1325,
    longitude: 23.1688,
    weight: 3,
    districts: ['Centrum', 'Bojary', 'Dziesięciny', 'Wygoda'],
    venues: ['Planty', 'Rynek Kościuszki', 'Pałac Branickich', 'Węglowa']
  },
  {
    name: 'Rzeszów',
    latitude: 50.0412,
    longitude: 21.9991,
    weight: 3,
    districts: ['Śródmieście', 'Drabinianka', 'Staromieście', 'Zalesie'],
    venues: ['Bulwary', 'Rynek', 'Park Papieski', 'Lisia Góra']
  },
  {
    name: 'Toruń',
    latitude: 53.0138,
    longitude: 18.5984,
    weight: 3,
    districts: ['Stare Miasto', 'Bydgoskie Przedmieście', 'Mokre', 'Rubinkowo'],
    venues: ['Bulwar Filadelfijski', 'Jordanki', 'Błonia Nadwiślańskie', 'Rynek Nowomiejski']
  },
  {
    name: 'Kielce',
    latitude: 50.8661,
    longitude: 20.6286,
    weight: 2,
    districts: ['Centrum', 'Kadzielnia', 'Szydłówek', 'Baranówek'],
    venues: ['Kadzielnia', 'Rynek', 'Park Miejski', 'Wietrznia']
  },
  {
    name: 'Olsztyn',
    latitude: 53.7784,
    longitude: 20.4801,
    weight: 2,
    districts: ['Śródmieście', 'Zatorze', 'Jaroty', 'Likusy'],
    venues: ['Plaża Miejska', 'Stare Miasto', 'Park Centralny', 'Jezioro Długie']
  },
  {
    name: 'Opole',
    latitude: 50.6751,
    longitude: 17.9213,
    weight: 2,
    districts: ['Śródmieście', 'Zaodrze', 'Pasieka', 'Malinka'],
    venues: ['Wyspa Bolko', 'Rynek', 'Amfiteatr', 'Błonia']
  },
  {
    name: 'Zielona Góra',
    latitude: 51.9356,
    longitude: 15.5062,
    weight: 2,
    districts: ['Centrum', 'Winnica', 'Jędrzychów', 'Chynów'],
    venues: ['Palmiarnia', 'Park Piastowski', 'Wzgórza Winne', 'Deptak']
  }
];

function regionalCity(name: string, latitude: number, longitude: number): CityDefinition {
  return {
    name,
    latitude,
    longitude,
    weight: 1,
    districts: ['Centrum', 'Stare Miasto', 'Północ', 'Południe'],
    venues: ['Rynek', 'Park Miejski', 'Bulwary', 'Centrum Kultury']
  };
}

/**
 * A nationwide set of event anchors used by the performance seed. It includes
 * all 49 former voivodeship capitals plus Gdynia, so even a zoomed-out map has
 * representative data across the whole country instead of one dominant cluster.
 */
export const performanceCities: CityDefinition[] = [
  ...cities,
  regionalCity('Biała Podlaska', 52.0324, 23.1165),
  regionalCity('Bielsko-Biała', 49.8224, 19.0584),
  regionalCity('Chełm', 51.1431, 23.4712),
  regionalCity('Ciechanów', 52.8814, 20.6196),
  regionalCity('Częstochowa', 50.8118, 19.1203),
  regionalCity('Elbląg', 54.1561, 19.4045),
  regionalCity('Gorzów Wielkopolski', 52.7325, 15.2369),
  regionalCity('Jelenia Góra', 50.9044, 15.7194),
  regionalCity('Kalisz', 51.7611, 18.091),
  regionalCity('Konin', 52.223, 18.2511),
  regionalCity('Koszalin', 54.1944, 16.1722),
  regionalCity('Krosno', 49.6887, 21.7706),
  regionalCity('Legnica', 51.207, 16.1553),
  regionalCity('Leszno', 51.8419, 16.5749),
  regionalCity('Łomża', 53.1781, 22.0594),
  regionalCity('Nowy Sącz', 49.6218, 20.697),
  regionalCity('Ostrołęka', 53.0833, 21.5757),
  regionalCity('Piła', 53.1515, 16.7382),
  regionalCity('Piotrków Trybunalski', 51.4052, 19.703),
  regionalCity('Płock', 52.5463, 19.7065),
  regionalCity('Przemyśl', 49.7839, 22.7678),
  regionalCity('Radom', 51.4027, 21.1471),
  regionalCity('Siedlce', 52.1676, 22.2902),
  regionalCity('Sieradz', 51.5956, 18.7303),
  regionalCity('Skierniewice', 51.9547, 20.1583),
  regionalCity('Słupsk', 54.4641, 17.0287),
  regionalCity('Suwałki', 54.1115, 22.9308),
  regionalCity('Tarnobrzeg', 50.573, 21.6794),
  regionalCity('Tarnów', 50.0121, 20.9858),
  regionalCity('Wałbrzych', 50.7714, 16.2843),
  regionalCity('Włocławek', 52.6483, 19.0677),
  regionalCity('Zamość', 50.7231, 23.2519)
];

export const eventCopy: Record<EventCategory, { nouns: string[]; details: string[] }> = {
  ARTS_AND_CULTURE: {
    nouns: ['Wystawa młodej sztuki', 'Noc galerii', 'Spacer architektoniczny', 'Warsztaty ceramiczne'],
    details: [
      'lokalnych artystów',
      'z oprowadzaniem kuratorskim',
      'w kameralnej pracowni',
      'po nieoczywistych miejscach'
    ]
  },
  ENTERTAINMENT: {
    nouns: ['Wieczór stand-up', 'Quiz miejski', 'Impro bez scenariusza', 'Maraton planszówek'],
    details: [
      'z otwartym mikrofonem',
      'dla początkujących ekip',
      'z nagrodami od lokalnych partnerów',
      'do późnego wieczora'
    ]
  },
  SPORT_AND_RECREATION: {
    nouns: ['Bieg o wschodzie słońca', 'Rowerowa pętla miejska', 'Trening funkcjonalny', 'Turniej siatkówki'],
    details: ['dla każdego poziomu', 'z pacemakerami', 'z instruktorem i rozgrzewką', 'w rekreacyjnym tempie']
  },
  EDUCATION_AND_DEVELOPMENT: {
    nouns: ['Warsztat wystąpień publicznych', 'Klub językowy', 'Praktyczne AI po godzinach', 'Akademia fotografii'],
    details: [
      'z ćwiczeniami w grupach',
      'bez wymaganej wiedzy wstępnej',
      'prowadzony przez praktyków',
      'z sesją pytań i odpowiedzi'
    ]
  },
  SOCIAL_MEETUPS: {
    nouns: ['Poznajmy się przy kawie', 'Piknik nowych znajomości', 'Language exchange', 'Spacer bez telefonu'],
    details: [
      'dla osób nowych w mieście',
      'w luźnej atmosferze',
      'z prostymi zabawami integracyjnymi',
      'bez zapisów i zobowiązań'
    ]
  },
  FESTIVALS_AND_FAIRS: {
    nouns: ['Festiwal lokalnych historii', 'Jarmark rzemiosła', 'Święto dzielnicy', 'Weekend designu'],
    details: [
      'z całodziennym programem',
      'z małymi wystawcami',
      'na kilku plenerowych scenach',
      'z wejściem dla całych rodzin'
    ]
  },
  TRADE_AND_MARKETS: {
    nouns: ['Targ vintage', 'Giełda winyli', 'Sąsiedzka wymiana roślin', 'Kiermasz polskich marek'],
    details: ['z rzeczami z drugiego obiegu', 'bez pośredników', 'z limitowanymi kolekcjami', 'od lokalnych twórców']
  },
  FAMILY_AND_KIDS: {
    nouns: ['Rodzinne eksperymenty', 'Teatrzyk pod chmurką', 'Budujemy miasto z kartonu', 'Leśna gra terenowa'],
    details: ['dla dzieci od 5 lat', 'z animatorem', 'z przestrzenią dla rodziców', 'w spokojnym rodzinnym rytmie']
  },
  BUSINESS_AND_CAREER: {
    nouns: ['Śniadanie przedsiębiorców', 'Tech meetup', 'Portfolio review', 'Wieczór founderów'],
    details: [
      'z krótkimi prezentacjami',
      'z networkingiem bez spiny',
      'dla zmieniających branżę',
      'z historiami sukcesów i porażek'
    ]
  },
  COMMUNITY_AND_ACTIVISM: {
    nouns: ['Sąsiedzkie sprzątanie', 'Otwarta debata miejska', 'Naprawmy to razem', 'Wymiana książek i pomysłów'],
    details: [
      'z lokalną społecznością',
      'z konkretnym planem działania',
      'dla wszystkich mieszkańców',
      'prowadzona oddolnie'
    ]
  },
  MUSIC_AND_NIGHTLIFE: {
    nouns: ['Koncert na małej scenie', 'Silent disco', 'Jam session', 'Elektroniczna noc'],
    details: ['z lokalnym składem', 'do ostatniego bisu', 'z selekcją niezależnych DJ-ów', 'w wyjątkowej przestrzeni']
  },
  HEALTH_AND_WELLNESS: {
    nouns: ['Joga w parku', 'Warsztat dobrego snu', 'Oddech i regeneracja', 'Zdrowy kręgosłup'],
    details: [
      'dla początkujących',
      'z matami na miejscu',
      'prowadzony spokojnym tempem',
      'z praktycznym zestawem ćwiczeń'
    ]
  },
  FOOD_AND_CULINARY: {
    nouns: ['Kolacja przy wspólnym stole', 'Warsztaty kuchni roślinnej', 'Spacer kawowy', 'Festiwal street foodu'],
    details: ['z sezonowym menu', 'u lokalnych gospodarzy', 'z degustacją', 'z przepisami do zabrania']
  }
};

export const firstNames = [
  'Aleksandra',
  'Anna',
  'Barbara',
  'Ewa',
  'Julia',
  'Karolina',
  'Katarzyna',
  'Magdalena',
  'Maja',
  'Marta',
  'Natalia',
  'Zofia',
  'Adam',
  'Bartosz',
  'Jakub',
  'Jan',
  'Kacper',
  'Maciej',
  'Michał',
  'Paweł',
  'Piotr',
  'Tomasz',
  'Wojciech'
];

export const lastNames = [
  'Bąk',
  'Dąbrowski',
  'Grabowski',
  'Jankowski',
  'Kaczmarek',
  'Kamiński',
  'Kowalczyk',
  'Kowalski',
  'Król',
  'Lewandowski',
  'Mazur',
  'Nowak',
  'Pawlak',
  'Piotrowski',
  'Sikora',
  'Szymański',
  'Wójcik',
  'Woźniak',
  'Zając',
  'Zieliński'
];

export const interests = [
  'sztuka',
  'muzyka',
  'sport',
  'technologia',
  'jedzenie',
  'podróże',
  'rodzina',
  'wellness',
  'biznes',
  'natura',
  'fotografia',
  'książki',
  'taniec',
  'wolontariat'
];

export const commentBodies = [
  'Brzmi świetnie, kto jeszcze się wybiera?',
  'Byłam na poprzedniej edycji i bardzo polecam.',
  'Czy trzeba zabrać własny sprzęt?',
  'Super inicjatywa dla naszej okolicy!',
  'Właśnie czegoś takiego szukałem.',
  'Czy wydarzenie odbędzie się także przy gorszej pogodzie?',
  'Zapisane — do zobaczenia na miejscu.',
  'Czy są jeszcze wolne miejsca?',
  'Świetny pomysł na weekend.',
  'Będę pierwszy raz, ale chętnie dołączę.',
  'Dzięki za dokładny opis i wskazówki dojazdu.',
  'Można przyjść trochę później?',
  'Ekipa zebrana, widzimy się!',
  'Czy wydarzenie jest odpowiednie dla początkujących?',
  'Czekam na kolejne informacje od organizatora.'
];
