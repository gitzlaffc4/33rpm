/**
 * 33rpm admin CLI, bundled to dist/cli.js (`npm run build:cli`).
 *
 * In Docker:   docker exec -it 33rpm 33rpm <command>
 * From source: node dist/cli.js <command>
 *
 * Works on SQLite and PostgreSQL (it uses the same repos as the app). It reads the
 * same environment as the server, and expects the server to have run at least once
 * (so the database is migrated).
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

import { hashPassword } from "better-auth/crypto";

import { getDb } from "@/db";
import { countUsers, deleteSessionsForUser, findUserByEmail, setPassword } from "@/db/repos/users";
import { EnvError, getEnv } from "@/env";
import { formatSetupBanner, issueSetupCodeIfNeeded } from "@/lib/setup-code";

const HELP = `33rpm admin CLI

Usage:
  33rpm reset-password <email> [--generate]
      Set a new password for <email> and sign that user out everywhere.
      Prompts for the new password, or prints a random one with --generate.
      Creates a password login if the user only had SSO.

  33rpm create-setup-code
      Print a fresh first-run setup code. Only works while no users exist.

  33rpm help

In Docker, run it as: docker exec -it 33rpm 33rpm <command>`;

const MIN_PASSWORD = 10;

class CliError extends Error {}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    let prompted = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      // Echo the prompt once, then nothing the user types.
      if (!prompted) {
        prompted = true;
        write.call(rl, s);
      }
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function resetPassword(args: string[]) {
  const email = args.find((a) => !a.startsWith("--"));
  const generate = args.includes("--generate");
  if (!email) throw new CliError("Usage: 33rpm reset-password <email> [--generate]");

  const user = await findUserByEmail(email);
  if (!user) throw new CliError(`No user with email ${email}`);

  let password: string;
  if (generate) {
    password = randomBytes(15).toString("base64url"); // 20 chars, ~120 bits
  } else {
    if (!process.stdin.isTTY) {
      throw new CliError("No terminal to prompt on. Use `docker exec -it …`, or pass --generate.");
    }
    password = await readHidden("New password: ");
    if (password.length < MIN_PASSWORD) {
      throw new CliError(`Password must be at least ${MIN_PASSWORD} characters.`);
    }
    if ((await readHidden("Repeat password: ")) !== password) {
      throw new CliError("Passwords don't match.");
    }
  }

  // Better Auth's own hasher (the same one sign-in verifies against).
  const { created } = await setPassword(user.id, await hashPassword(password));
  const revoked = await deleteSessionsForUser(user.id);

  console.log(`Password ${created ? "login created" : "updated"} for ${user.email}.`);
  console.log(`Signed out of ${revoked} session${revoked === 1 ? "" : "s"}.`);
  if (generate) {
    console.log(
      `\nTemporary password: ${password}\nSign in and change it under Settings → Security.`,
    );
  }
  if (!getEnv().AUTH_LOCAL_LOGIN) {
    console.log("\nNote: AUTH_LOCAL_LOGIN=false, so password sign-in is currently disabled.");
  }
}

async function createSetupCode() {
  if ((await countUsers()) > 0) {
    throw new CliError(
      "Users already exist, so no setup code was issued. Use reset-password instead.",
    );
  }
  const code = await issueSetupCodeIfNeeded();
  if (!code) throw new CliError("Could not issue a setup code.");
  console.log(formatSetupBanner(code, getEnv().APP_URL));
  console.log("Any previously printed code is now invalid.");
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv.filter((a) => a !== "--allow-root");
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return command ? 0 : 1;
  }

  // Running as root would create root-owned SQLite WAL files the app can't write.
  if (process.getuid?.() === 0 && !argv.includes("--allow-root")) {
    throw new CliError(
      "Refusing to run as root. In Docker use the `33rpm` wrapper (it switches to PUID), or pass --allow-root.",
    );
  }

  try {
    getEnv();
  } catch (e) {
    if (e instanceof EnvError) throw new CliError(e.message);
    throw e;
  }

  try {
    switch (command) {
      case "reset-password":
        await resetPassword(rest);
        return 0;
      case "create-setup-code":
        await createSetupCode();
        return 0;
      default:
        throw new CliError(`Unknown command: ${command}\n\n${HELP}`);
    }
  } finally {
    await getDb().close();
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    if (e instanceof CliError) {
      console.error(`33rpm: ${e.message}`);
    } else {
      const msg = String((e as Error)?.message ?? e);
      console.error(
        /no such table|does not exist/i.test(msg)
          ? "33rpm: the database isn't initialised yet. Start the server once so it can run migrations."
          : `33rpm: ${msg}`,
      );
    }
    process.exit(1);
  },
);
