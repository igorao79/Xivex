import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import {
  getUserByEmail,
  getUserById,
  createUser,
  linkAccount,
  getAccountByProvider,
} from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/auth/signin",
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // On first sign-in, persist user.id into token
      if (user) {
        token.id = user.id;
      }

      // Handle OAuth account linking
      if (account && account.provider !== "credentials" && user) {
        const existingAccount = await getAccountByProvider(
          account.provider,
          account.providerAccountId
        );

        if (!existingAccount) {
          // Check if user with this email already exists
          let dbUser = await getUserByEmail(user.email!);

          if (!dbUser) {
            // Create new user
            const id = crypto.randomUUID();
            dbUser = await createUser({
              id,
              name: user.name || "",
              email: user.email!,
              image: user.image || undefined,
            });
            token.id = id;
          } else {
            token.id = dbUser.id;
          }

          // Link the OAuth account
          await linkAccount({
            userId: dbUser.id,
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            type: account.type || "oauth",
            accessToken: account.access_token as string | undefined,
            refreshToken: account.refresh_token as string | undefined,
            expiresAt: account.expires_at as number | undefined,
          });
        } else {
          token.id = existingAccount.userId;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
