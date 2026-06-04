import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resources, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "@pw/shared";

const LANG_KEY = "pw_lang";

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Restore a previously chosen language.
void AsyncStorage.getItem(LANG_KEY).then((saved) => {
  if (saved && (SUPPORTED_LANGUAGES as string[]).includes(saved) && saved !== i18n.language) {
    void i18n.changeLanguage(saved);
  }
});

export async function setLanguage(lang: string): Promise<void> {
  await i18n.changeLanguage(lang);
  await AsyncStorage.setItem(LANG_KEY, lang);
}

export default i18n;
