"use client";

import { useState } from "react";
import { saveApplicationStep } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";
import { ChoiceGroup, type Choice } from "@/components/fields";
import { CITIES } from "@/lib/cities";

// The city step, which is two questions that only make sense together: where
// you are, and whether you are also somewhere else. Splitting them into two
// screens would ask everybody a question that only applies to some people.
export function CityStep({ city, secondCity }: { city: string; secondCity: string }) {
  const [primary, setPrimary] = useState(city);
  const [second, setSecond] = useState(secondCity);
  const options: Choice[] = CITIES.map((c) => ({ value: c.value, label: c.label }));

  return (
    <form action={saveApplicationStep} className="space-y-6" noValidate>
      <input type="hidden" name="step" value="city" />
      <ChoiceGroup
        name="city"
        label="City"
        required
        options={options}
        value={primary}
        onChange={(next) => {
          setPrimary(next);
          if (next === second) setSecond("");
        }}
      />
      {primary && (
        <ChoiceGroup
          name="secondCity"
          label="Also there often"
          options={[{ value: "", label: "Just one city" }, ...options.filter((o) => o.value !== primary)]}
          value={second}
          onChange={setSecond}
          hint="Optional. Pick a second and your matchmaker can introduce you in both."
        />
      )}
      <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">
        Continue
      </SubmitButton>
    </form>
  );
}

export function GenderStep({ gender, error }: { gender: string; error?: string }) {
  const [value, setValue] = useState(gender);
  return (
    <form action={saveApplicationStep} className="space-y-6" noValidate>
      <input type="hidden" name="step" value="gender" />
      <ChoiceGroup
        name="gender"
        label="You are"
        required
        options={[
          { value: "woman", label: "Woman" },
          { value: "man", label: "Man" },
          { value: "nonbinary", label: "Non-binary" },
        ]}
        value={value}
        onChange={setValue}
        error={error}
      />
      <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">
        Continue
      </SubmitButton>
    </form>
  );
}
