import { downloadFile } from '@documenso/lib/client-only/download-file';
import { AppError } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
import {
  ZAdminAuditLogExportFormatSchema,
  ZAdminAuditLogExportSourceSchema,
} from '@documenso/trpc/server/admin-router/export-audit-logs.types';
import { Button } from '@documenso/ui/primitives/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@documenso/ui/primitives/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { DownloadIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SettingsHeader } from '~/components/general/settings-header';

const ZFormSchema = z.object({
  format: ZAdminAuditLogExportFormatSchema,
  source: ZAdminAuditLogExportSourceSchema,
  dateFrom: z.string(),
  dateTo: z.string(),
  limit: z.coerce.number().int().min(1).max(10000),
});

type TFormSchema = z.infer<typeof ZFormSchema>;

const getDateTimeValue = (value: string) => {
  if (!value) {
    return undefined;
  }

  return new Date(value).toISOString();
};

export default function AdminAuditLogsPage() {
  const { t } = useLingui();
  const { toast } = useToast();

  const form = useForm<TFormSchema>({
    resolver: zodResolver(ZFormSchema),
    defaultValues: {
      format: 'CSV',
      source: 'ALL',
      dateFrom: '',
      dateTo: '',
      limit: 5000,
    },
  });

  const { mutateAsync: exportAuditLogs } = trpc.admin.auditLog.export.useMutation();

  const onFormSubmit = async (data: TFormSchema) => {
    try {
      const result = await exportAuditLogs({
        format: data.format,
        source: data.source,
        dateFrom: getDateTimeValue(data.dateFrom),
        dateTo: getDateTimeValue(data.dateTo),
        limit: data.limit,
      });

      const blob = new Blob([result.data], {
        type: result.mimeType,
      });

      downloadFile({
        data: blob,
        filename: result.filename,
      });

      toast({
        title: t`Audit export downloaded`,
        description: t`Exported ${result.counts.exported} audit events.`,
      });
    } catch (err) {
      const error = AppError.parseError(err);

      console.error(error);

      toast({
        title: t`Something went wrong`,
        description: error.message || t`Failed to export audit logs. Please try again later.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <SettingsHeader
        title={t`Audit Logs`}
        subtitle={t`Export document and security audit logs for SOC2 evidence collection.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>SOC2 audit export</Trans>
          </CardTitle>

          <CardDescription>
            <Trans>
              Export normalized audit events with actor, subject, timestamp, IP address, user agent, and event metadata.
            </Trans>
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onFormSubmit)}>
              <fieldset className="grid gap-4 md:grid-cols-2" disabled={form.formState.isSubmitting}>
                <FormField
                  control={form.control}
                  name="format"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans>Format</Trans>
                      </FormLabel>

                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t`Select format`} />
                          </SelectTrigger>
                        </FormControl>

                        <SelectContent>
                          <SelectItem value="CSV">
                            <Trans>CSV</Trans>
                          </SelectItem>
                          <SelectItem value="JSON">
                            <Trans>JSON</Trans>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="source"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans>Audit source</Trans>
                      </FormLabel>

                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t`Select source`} />
                          </SelectTrigger>
                        </FormControl>

                        <SelectContent>
                          <SelectItem value="ALL">
                            <Trans>Document and security logs</Trans>
                          </SelectItem>
                          <SelectItem value="DOCUMENT">
                            <Trans>Document logs only</Trans>
                          </SelectItem>
                          <SelectItem value="USER_SECURITY">
                            <Trans>User security logs only</Trans>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans>From</Trans>
                      </FormLabel>

                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dateTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans>To</Trans>
                      </FormLabel>

                      <FormControl>
                        <Input {...field} type="datetime-local" />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="limit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans>Maximum events</Trans>
                      </FormLabel>

                      <FormControl>
                        <Input {...field} min={1} max={10000} type="number" />
                      </FormControl>

                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-end">
                  <Button type="submit" loading={form.formState.isSubmitting}>
                    <DownloadIcon className="mr-2 h-4 w-4" />
                    <Trans>Export audit logs</Trans>
                  </Button>
                </div>
              </fieldset>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
