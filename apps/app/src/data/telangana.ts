/**
 * All 119 Telangana Assembly Constituencies (2008 ECI Delimitation)
 * with their constituent mandals / areas.
 * Organised by region in source; displayed alphabetically in the picker.
 */

export type ConstituencyName = string;
export type MandalName = string;

export const TELANGANA_CONSTITUENCIES: Record<ConstituencyName, MandalName[]> = {
  // ── Adilabad / Mancherial / Nirmal / Kumram Bheem Asifabad ─────────────────
  "Adilabad":           ["Adilabad Urban", "Bela", "Gudihatnoor", "Mavala", "Neradigonda"],
  "Asifabad (ST)":      ["Asifabad", "Jainath", "Sirpur (U)", "Wankidi", "Bazarhatnoor"],
  "Bellampalli (SC)":   ["Bellampalli", "Laxmapur", "Kyathanpalle", "Hajipur", "Naspur"],
  "Bhainsa":            ["Bhainsa", "Kubeer", "Tanur", "Pembi", "Sarangapur"],
  "Boath (ST)":         ["Boath", "Utnoor", "Ichoda", "Narnoor", "Dahegaon"],
  "Chennur (SC)":       ["Chennur", "Mandamarri", "Kasipet", "Vemanpalle"],
  "Khanapur (ST)":      ["Khanapur", "Wankidi", "Tiryani", "Rebbena", "Dahegaon (T)"],
  "Luxettipet (SC)":    ["Luxettipet", "Hajipur", "Jannaram", "Laxmanchanda", "Kotapalle"],
  "Mancherial":         ["Mancherial", "Shankarampet", "Gandhari", "Ramagiri"],
  "Mudhole":            ["Mudhole", "Bhainsa Rural", "Dilawarpur", "Mamda"],
  "Nirmal":             ["Nirmal", "Sarangapur", "Dharmaraopeta", "Khanapur (N)"],
  "Sirpur (ST)":        ["Sirpur (T)", "Sirpur Urban", "Pembi", "Narnoor"],

  // ── Nizamabad / Kamareddy ───────────────────────────────────────────────────
  "Armoor":             ["Armoor", "Pitlam", "Bheemgal", "Varni"],
  "Balkonda":           ["Balkonda", "Indalwai", "Mortad", "Kotagiri"],
  "Banswada":           ["Banswada", "Jakranpalli", "Nandipet", "Kotgiri"],
  "Bodhan":             ["Bodhan", "Renjal", "Yedapalli", "Srikonda"],
  "Dichpally":          ["Dichpally", "Navipet", "Mosra", "Rudrur", "Lingampet"],
  "Kamareddy":          ["Kamareddy", "Ramareddy", "Banswada (K)", "Bhiknur"],
  "Nizamabad (Rural)":  ["Nizamabad Rural", "Bheemgal", "Varni", "Pitlam"],
  "Nizamabad (Urban)":  ["Nizamabad Urban", "Nizam Sagar", "Machareddy"],
  "Yellareddy":         ["Yellareddy", "Sadasivanagar", "Tadwai", "Kotgiri (Y)"],

  // ── Karimnagar / Jagityal / Rajanna Sircilla / Peddapalle ─────────────────
  "Choppadandi (SC)":   ["Choppadandi", "Veenavanka", "Dharmaram", "Manthani (C)"],
  "Dharmapuri":         ["Dharmapuri", "Metpally", "Raikal", "Mallial", "Kataram"],
  "Huzurabad":          ["Huzurabad", "Jammikunta", "Veenavanka", "Shankarapatnam"],
  "Husnabad":           ["Husnabad", "Huzurabad (R)", "Koheda", "Bheemadevarapalle"],
  "Jagtial":            ["Jagtial", "Korutla", "Pegadapalli", "Raikal (J)"],
  "Karimnagar":         ["Karimnagar Urban", "Karimnagar Rural", "Sultanabad"],
  "Koratla":            ["Koratla", "Metpally", "Sarangapur (K)", "Dharmapuri (K)"],
  "Manakondur (SC)":    ["Manakondur", "Shankarapatnam", "Koheda", "Gambhiraopeta"],
  "Manthani":           ["Manthani", "Manthani Urban", "Ramagundam", "Sultanabad (M)"],
  "Peddapalli (SC)":    ["Peddapalli", "Odela", "Srirampur", "Julapalle", "Ramgundam (P)"],
  "Sircilla":           ["Sircilla", "Illanthakunta", "Gambhiraopeta", "Yellareddypet"],
  "Vemulawada":         ["Vemulawada", "Shayampet", "Karimnagar (V)", "Veenavanka (V)"],

  // ── Warangal / Jangaon ─────────────────────────────────────────────────────
  "Bhupalpally (ST)":   ["Bhupalpally", "Eturunagaram", "Govindaraopeta", "Garla", "Mahadevpur"],
  "Cherial":            ["Cherial", "Nallabelly", "Parvathagiri", "Atmakur (W)"],
  "Jangaon":            ["Jangaon", "Bachannapeta", "Zaffergadh", "Lingalaghanpur"],
  "Narsampet":          ["Narsampet", "Chennaraopeta", "Atmakur", "Mangapet"],
  "Palakurthi":         ["Palakurthi", "Ghanpur Station", "Geesugonda", "Hasanparthi"],
  "Parkal":             ["Parkal", "Parvathagiri", "Nallabelly", "Regonda"],
  "Station Ghanpur":    ["Station Ghanpur", "Ghanpur Rural", "Rayaparthi", "Raghunathpalle"],
  "Warangal (East)":    ["Warangal Urban East", "Hanamkonda", "Wardhannapet (E)"],
  "Warangal (West)":    ["Warangal Urban West", "Kazipet", "Hanamkonda West"],
  "Wardhannapet (SC)":  ["Wardhannapet", "Shayampet (W)", "Regonda", "Chityal"],

  // ── Mahabubabad ────────────────────────────────────────────────────────────
  "Dornakal (SC)":      ["Dornakal", "Thirumalayapalem", "Nellikuduru", "Gundala"],
  "Mahabubabad (ST)":   ["Mahabubabad", "Kesamudram", "Gudur", "Narsimhulapet", "Bayyaram"],
  "Mulugu (ST)":        ["Mulugu", "Mangapet", "Tadvai", "Venkatapur", "Eturnagaram"],
  "Thorrur":            ["Thorrur", "Maripeda", "Kuravi", "Narsampet (T)"],

  // ── Khammam / Bhadradri Kothagudem ────────────────────────────────────────
  "Bhadrachalam (ST)":  ["Bhadrachalam", "Burgampahad", "Charla", "Aswapuram", "Konnuru"],
  "Khammam":            ["Khammam Urban", "Khammam Rural", "Enkoor", "Raghunadhapalem"],
  "Kothagudem (ST)":    ["Kothagudem", "Palvancha", "Sujathanagar", "Tekulapally"],
  "Madhira (SC)":       ["Madhira", "Nellikuduru", "Penuballi", "Kallur"],
  "Palair (SC)":        ["Palair", "Thirumalayapalem", "Bonakal", "Chintakani"],
  "Pinapaka (ST)":      ["Pinapaka", "Yellandu", "Aswapuram (P)", "Cherla"],
  "Sathupalli (SC)":    ["Sathupalli", "Mudigonda", "Tallada", "Vemsoor"],
  "Wyra (ST)":          ["Wyra", "Julurpad", "Chandrugonda", "Yerrupalem"],
  "Yellandu (SC)":      ["Yellandu", "Palvancha (Y)", "Tekulapally", "Burgampahad (Y)"],

  // ── Nalgonda / Suryapet / Yadadri Bhuvanagiri ─────────────────────────────
  "Alair":              ["Alair", "Choutuppal", "Ramannapet", "Mothkur"],
  "Bhongir":            ["Bhongir", "Bibinagar", "Yadagirigutta", "Yadadri"],
  "Munugode (SC)":      ["Munugode", "Chinthalpahad", "Nakrekal (M)", "Marriguda (M)"],
  "Ramannapet":         ["Ramannapet", "Mothkur (R)", "Choutuppal (R)", "Aler"],
  "Devarakonda (SC)":   ["Devarakonda", "Thungathurthy", "Nakrekal", "Marriguda"],
  "Huzurnagar (SC)":    ["Huzurnagar", "Munagala", "Thirumalagiri", "Nidamanur"],
  "Kodad (SC)":         ["Kodad", "Mothkur (K)", "Nadigudem", "Anabattu"],
  "Miryalaguda (SC)":   ["Miryalaguda", "Nidamanur", "Nereducharla", "Damarcherla"],
  "Nakrekal (SC)":      ["Nakrekal", "Munugode", "Chandur", "Tripuraram"],
  "Nalgonda":           ["Nalgonda Urban", "Nalgonda Rural", "Kattangur", "Rajapet (N)"],
  "Suryapet":           ["Suryapet", "Chilkur", "Nereducharla (S)", "Penpahad"],
  "Tungaturthy (SC)":   ["Thungathurthy", "Mattampally", "Mellacheruvu", "Garidepally"],

  // ── Mahbubnagar / Wanaparthy / Gadwal / Nagarkurnool ──────────────────────
  "Achampet":           ["Achampet", "Makthal", "Veldanda", "Aija", "Talakondapally"],
  "Alampur":            ["Alampur", "Wadepally", "Manopad", "Pebbair"],
  "Devarkadra":         ["Devarkadra", "Maddur", "Nawabpet", "Maganoor"],
  "Gadwal":             ["Gadwal", "Itikyal", "Waddepalle", "Gataprole"],
  "Jadcherla":          ["Jadcherla", "Balanagar", "Kothakota", "Balmoor"],
  "Kalwakurthy (ST)":   ["Kalwakurthy", "Peddakothapalli", "Lingal", "Veldanda (K)"],
  "Kollapur (SC)":      ["Kollapur", "Kodangal", "Pangal", "Maddur (K)"],
  "Mahbubnagar":        ["Mahabubnagar Urban", "Mahabubnagar Rural", "Gandeed", "Hanwada"],
  "Nagarkurnool (SC)":  ["Nagarkurnool", "Bijinapally", "Tadoor", "Maddur (N)"],
  "Narayanpet":         ["Narayanpet", "Kosgi", "Utkoor", "Damaragidda"],
  "Wanaparthy":         ["Wanaparthy", "Pebbair", "Gopalpet", "Chinnambavi"],

  // ── Medak / Sangareddy / Siddipet ─────────────────────────────────────────
  "Andole (SC)":        ["Andole", "Alladurg", "Munipally", "Chegunta", "Ramayampet"],
  "Bejjanki":           ["Bejjanki", "Kondapak", "Nangnur", "Mirdoddi (B)"],
  "Narsapur (SC)":      ["Narsapur", "Ramayampet", "Toopran (N)", "Chegunta (N)"],
  "Dubbaka":            ["Dubbaka", "Siddipet", "Thoguta", "Cherial (D)"],
  "Gajwel":             ["Gajwel", "Jagdevpur", "Tupran", "Mirdoddi", "Raipole"],
  "Medak (SC)":         ["Medak", "Toopran", "Papannapet", "Narsapur (M)"],
  "Narayankhed (SC)":   ["Narayankhed", "Nyalkal", "Yeldurthy", "Kohir"],
  "Patancheru (SC)":    ["Patancheru", "Sadasivpet", "Ameenpur", "Jinnaram"],
  "Sangareddy":         ["Sangareddy", "Pulkal", "Kandi", "Hatnoora", "Andole (S)"],
  "Siddipet":           ["Siddipet Urban", "Siddipet Rural", "Markook", "Nanganur"],
  "Zaheerabad (SC)":    ["Zaheerabad", "Nyalkal", "Yeldurthy", "Jogipet"],

  // ── Hyderabad city ─────────────────────────────────────────────────────────
  "Amberpet":           ["Amberpet", "Nallakunta", "Chilkalguda"],
  "Bahadurpura":        ["Bahadurpura", "Falaknuma", "Santoshnagar"],
  "Chandrayangutta":    ["Chandrayangutta", "Kishanbagh", "Barkas"],
  "Charminar":          ["Charminar", "Saidabad", "Malakpet"],
  "Goshamahal":         ["Goshamahal", "Abids", "Nampally Urban"],
  "Jubilee Hills":      ["Jubilee Hills", "Banjara Hills", "Madhapur"],
  "Karwan":             ["Karwan", "Mehdipatnam", "Tolichowki"],
  "Khairatabad":        ["Khairatabad", "Lakdikapool", "Masab Tank"],
  "LB Nagar":           ["LB Nagar", "Hayathnagar", "Vanasthalipuram", "Saroornagar"],
  "Malkajgiri":         ["Malkajgiri", "Kapra", "Sainikpuri", "Alwal"],
  "Maheswaram (SC)":    ["Maheswaram", "Kandukur", "Manchal", "Marpalle"],
  "Musheerabad (SC)":   ["Musheerabad", "Rein Bazar", "Moghalpura"],
  "Nampally":           ["Nampally", "Himayatnagar", "Basheerbagh"],
  "Qutbullapur (SC)":   ["Qutbullapur", "Bachupally", "Dundigal", "Medchal"],
  "Rajendranagar":      ["Rajendranagar", "Attapur", "Shivrampalli", "Hyderguda"],
  "Sanathnagar":        ["Sanathnagar", "Yousufguda", "Begumpet"],
  "Secunderabad":       ["Secunderabad", "Marredpally", "Trimulgherry"],
  "Secunderabad Cantonment": ["Secunderabad Cantonment", "Bowenpally", "Tirumalagiri"],
  "Serilingampally":    ["Serilingampally", "Gachibowli", "Kondapur", "Nanakramguda"],
  "Uppal":              ["Uppal", "Ghatkesar", "Nacharam", "Boduppal"],
  "Yakutpura (SC)":     ["Yakutpura", "Bawanapally", "Hashamabad"],

  // ── Rangareddy / Chevella ──────────────────────────────────────────────────
  "Amangal (SC)":       ["Amangal", "Manchal (A)", "Farooqnagar", "Maheshwaram (A)"],
  "Chevella (SC)":      ["Chevella", "Shankarpally", "Pudur", "Moinabad"],
  "Ibrahimpatnam":      ["Ibrahimpatnam", "Yacharam", "Saroornagar Rural"],
  "Kukatpally":         ["Kukatpally", "KPHB Colony", "Miyapur", "Nizampet"],
  "Pargi":              ["Pargi", "Pudur (P)", "Doma", "Tandur (R)"],
  "Shadnagar":          ["Shadnagar", "Kothur", "Farooqnagar (S)", "Bhanur"],
  "Tandur (SC)":        ["Tandur", "Vikarabad (T)", "Kulkacharla", "Basheerabad"],
  "Vikarabad":          ["Vikarabad", "Dharur", "Marpalle (V)", "Tandur Urban"],
};

/** Sorted list of all 119 constituency names for display in pickers. */
export const CONSTITUENCY_NAMES: ConstituencyName[] = Object.keys(TELANGANA_CONSTITUENCIES).sort();
