import { Global, Module, type Provider } from "@nestjs/common";
import { loadEnv } from "../config/env";
import { AuthkeyOtpProvider, FakeOtpProvider, OTP_PROVIDER } from "./otp.provider";
import { LocalStorageProvider, STORAGE_PROVIDER } from "./storage.provider";
import { MockPushProvider, PUSH_PROVIDER } from "./push.provider";
import {
  ASSISTED_SHARE,
  DefaultAssistedShareProvider,
  INSTAGRAM_PROVIDER,
  InstagramGraphProvider,
  MockInstagramProvider,
} from "./posting.provider";
import { MockPaymentProvider, PAYMENT_PROVIDER } from "./payment.provider";

const env = loadEnv();

/**
 * Wire each integration to its implementation based on env. Only dev/fake impls
 * exist today; real impls (MSG91, R2, FCM, Graph, Razorpay) slot in here behind
 * the same interface tokens with no consumer changes.
 */
const providers: Provider[] = [
  { provide: OTP_PROVIDER, useClass: env.OTP_PROVIDER === "authkey" ? AuthkeyOtpProvider : FakeOtpProvider },
  { provide: STORAGE_PROVIDER, useClass: LocalStorageProvider },
  { provide: PUSH_PROVIDER, useClass: MockPushProvider },
  { provide: ASSISTED_SHARE, useClass: DefaultAssistedShareProvider },
  {
    provide: INSTAGRAM_PROVIDER,
    useClass: env.INSTAGRAM_PROVIDER === "graph" ? InstagramGraphProvider : MockInstagramProvider,
  },
  { provide: PAYMENT_PROVIDER, useClass: MockPaymentProvider },
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
