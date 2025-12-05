import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function SiteHeader({
  title,
  showBack = false,
  backHref,
}: {
  title: string;
  showBack?: boolean;
  backHref?: string;
}) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6 lg:py-2">
        <SidebarTrigger className="-ml-1" />
        {showBack && backHref && (
          <Button variant="ghost" size="icon" asChild>
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Volver</span>
            </Link>
          </Button>
        )}
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{title}</h1>
        <div className="ml-auto flex items-center gap-2">
          {/* Botón trigger para el rightbar - Comentado porque ahora funciona con hover en iconos con notificación */}
          {/* <SidebarTrigger side="right" className="hidden sm:flex" /> */}
        </div>
      </div>
    </header>
  );
}
