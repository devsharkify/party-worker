import { Global, Module, type Provider } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { AuthkeyOtpProvider, FakeOtpProvider, OTP_PROVIDER } from "./otp.provider";
import { WhatsAppOtpProvider } from "./whatsapp-otp.provider";
import { LocalStorageProvider, STORAGE_PROVIDER } from "./storage.provider";
import { MockPushProvider, PUSH_PROVIDER } from "./push.provider";
import { FirebasePushProvider } from "./firebase-push.provider";
import {
  ASSISTED_SHARE,
  DefaultAssistedShareProvider,
  INSTAGRAM_PROVIDER,
  InstagramGraphProvider,
  MockInstagramProvider,
} from "./posting.provider";
import { MockPaymentProvider, PAYMENT_PROVIDER } from "./payment.provider";
import { RazorpayPaymentProvider } from "./razorpay.provider";

const env = loadEnv();

function selectOtpProvider() {
  if (env.OTP_PROVIDER === "authkey") return AuthkeyOtpProvider;
  if (env.OTP_PROVIDER === "whatsapp") return WhatsAppOtpProvider;
  return FakeOtpProvider;
}

/**
 * Wire each integration to its implementation based on env.
 * OTP:     fake (default) | authkey | whatsapp
 * Push:    mock (default) | firebase   [FCM_PROVIDER=firebase]
 * Payment: mock (default) | razorpay   [PAYMENT_PROVIDER=razorpay]
 * IG:      mock (default) | graph      [INSTAGRAM_PROVIDER=graph]
 */
const providers: Provider[] = [
  { provide: OTP_PROVIDER, useClass: selectOtpProvider() },
  { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider },
  { provide: PUSH_PROVIDER, useClass: env.FCM_PROVIDER === "firebase" ? FirebasePushProvider : MockPushProvider },
  { provide: ASSISTED_SHARE, useClass: DefaultAssistedShareProvider },
  {
    provide: INSTAGRAM_PROVIDER,
    useClass: env.INSTAGRAM_PROVIDER === "graph" ? InstagramGraphProvider : MockInstagramProvider,
  },
  { provide: PAYMENT_PROVIDER, useClass: env.PAYMENT_PROVIDER === "razorpay" ? RazorpayPaymentProvider : MockPaymentProvider },
];

@Global()
@Module({
  providers,
  exports: [
    OTP_PROVIDER,
    STORAGE_PROVIDER,
    PUSH_PROVIDER,
    ASSISTED_SHARE,
    INSTAGRAM_PROVIDER,
    PAYMENT_PROVIDER,
  ],
})
export class ProvidersModule {}
