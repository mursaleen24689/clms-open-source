import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { hodProcedure, paProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),

  // Employee leave management
  employee: router({
    // Get employee's own leave applications
    getMyApplications: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return db.getLeaveApplicationsByEmployee(ctx.user.id);
    }),

    // Get employee's leave balance
    getMyBalance: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const currentYear = new Date().getFullYear();
      return db.getLeaveBalance(ctx.user.id, currentYear);
    }),

    // Submit a new leave application
    submitApplication: protectedProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          numberOfDays: z.number(),
          reason: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        return db.createLeaveApplication({
          employeeId: ctx.user.id,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          numberOfDays: input.numberOfDays,
          reason: input.reason,
          leaveType: "CL",
          status: "pending",
        });
      }),
  }),

  // HOD approval management
  hod: router({
    // Get all pending leave applications
    getPendingApplications: hodProcedure.query(async () => {
      return db.getPendingLeaveApplications();
    }),

    // Approve a leave application
    approveApplication: hodProcedure
      .input(
        z.object({
          applicationId: z.number(),
          remarks: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        return db.updateLeaveApplicationStatus(
          input.applicationId,
          "approved",
          ctx.user.id,
          input.remarks
        );
      }),

    // Reject a leave application
    rejectApplication: hodProcedure
      .input(
        z.object({
          applicationId: z.number(),
          remarks: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        return db.updateLeaveApplicationStatus(
          input.applicationId,
          "rejected",
          ctx.user.id,
          input.remarks
        );
      }),

    // Mark leave as without pay
    markWithoutPay: hodProcedure
      .input(
        z.object({
          applicationId: z.number(),
          remarks: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        return db.updateLeaveApplicationStatus(
          input.applicationId,
          "without_pay",
          ctx.user.id,
          input.remarks
        );
      }),
  }),

  // PA reporting and admin
  pa: router({
    // Get all leave applications with filtering
    getAllApplications: paProcedure
      .input(
        z.object({
          employeeId: z.number().optional(),
          month: z.number().optional(),
          year: z.number().optional(),
          status: z.string().optional(),
        })
      )
      .query(async ({ input }) => {
        // This will be implemented to fetch from database with filters
        return [];
      }),

    // Get all employees for reporting
    getAllEmployees: paProcedure.query(async () => {
      return db.getAllEmployees();
    }),

    // Generate monthly report
    generateMonthlyReport: paProcedure
      .input(
        z.object({
          month: z.number(),
          year: z.number(),
        })
      )
      .query(async ({ input }) => {
        // This will be implemented to generate report data
        return {
          month: input.month,
          year: input.year,
          data: [],
        };
      }),

    // Generate yearly report
    generateYearlyReport: paProcedure
      .input(
        z.object({
          year: z.number(),
        })
      )
      .query(async ({ input }) => {
        // This will be implemented to generate report data
        return {
          year: input.year,
          data: [],
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
