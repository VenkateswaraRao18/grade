"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/api";
import { UserRole } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [studentIdNumber, setStudentIdNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetchJson("/auth/register", {
        email,
        password,
        role,
        student_id_number: role === "student" ? studentIdNumber : undefined,
      });
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-[3px] bg-sky-600 text-white">
            <GraduationCap className="h-5 w-5" strokeWidth={2} />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">Create an account</h1>
          <p className="mt-1 text-sm text-zinc-500">Join ORAL as a student or instructor</p>
        </div>

        <Card className="p-7">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label>I am a</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["student", "instructor"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      "rounded-[3px] border px-3 py-2.5 text-sm font-medium capitalize transition-colors",
                      role === r
                        ? "border-sky-600 bg-sky-50 text-sky-700"
                        : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-zinc-500">At least 8 characters</p>
            </div>

            {role === "student" && (
              <div>
                <Label htmlFor="student_id">Student ID number (U-number)</Label>
                <Input
                  id="student_id"
                  type="text"
                  required
                  value={studentIdNumber}
                  onChange={(e) => setStudentIdNumber(e.target.value)}
                  placeholder="U12345678"
                />
              </div>
            )}

            <FieldError>{error}</FieldError>

            <Button type="submit" disabled={submitting} className="mt-1 w-full">
              {submitting ? "Creating account..." : "Create account"}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-sky-600 hover:text-sky-500">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
