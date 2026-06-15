import { promises as fs } from "fs";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Check if database file exists
    let dbExists = false;
    let dbPath = "";

    try {
      await fs.access("./prisma/dev.db");
      dbExists = true;
      dbPath = "./prisma/dev.db";
    } catch (e) {
      // Try absolute path
      try {
        await fs.access(process.cwd() + "/prisma/dev.db");
        dbExists = true;
        dbPath = process.cwd() + "/prisma/dev.db";
      } catch (e2) {
        // Try looking in other locations
      }
    }

    // Try to query database
    let personCount = 0;
    try {
      personCount = await prisma.person.count();
    } catch (e: any) {
      return NextResponse.json({
        status: "error",
        message: "Database query failed",
        error: e.message,
        dbExists,
        dbPath,
        cwd: process.cwd(),
      }, { status: 500 });
    }

    return NextResponse.json({
      status: "ok",
      personCount,
      dbExists,
      dbPath,
      cwd: process.cwd(),
    });
  } catch (e: any) {
    return NextResponse.json({
      status: "error",
      error: e.message,
    }, { status: 500 });
  }
}
