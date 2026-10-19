// this validation file is used to validate the data received from the client before processing it.
// It ensures that the data meets the required format and constraints, preventing potential errors and security issues.
// and it uses Zod for schema validation. Zod is a TypeScript-first schema declaration and
// validation library that provides a simple and expressive way to define and validate data structures.

import { z } from "zod";
import z4 from "zod/v4";

export const registerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required")
    .max(80, "First name must be less than 80 characters or fewer"),

  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required")
    .max(80, "Last name must be less than 80 characters or fewer"),

  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(254, "Email is too long")
    .transform((value) => value.toLowerCase()),

  password: z
    .string()
    .min(12, "Password must be at least 12 characters long")
    .max(128, "Password must be less than 128 characters or fewer"),

  username: z.preprocess(
    (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? undefined : trimmed.toLowerCase();
      }

      return value;
    },
    z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be 30 characters or fewer")
      .regex(
        /^[a-z0-9_]+$/,
        "Username can contain lowercase letters, numbers, and underscores only"
      )
      .optional()
  ),
});

export type RegisterInput = z.infer<typeof registerSchema>;

// creating the loginSchema for validating login input data. 
// It ensures that the email and password fields meet the required format and constraints, 
// preventing potential errors and security issues.

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Invalid email address")
    .max(254, "Email is too long")
    .transform((value) => value.toLowerCase()),
  
  password: z4
    .string()
    .min(12, "Password must be at least 12 characters long")
    .max(128, "Password must be less than 128 characters or fewer"),
});
export type LoginInput = z.infer<typeof loginSchema>;