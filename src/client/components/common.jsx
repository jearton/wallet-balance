import { LoaderCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";

export const Hint = ({ children, className }) => (
  <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
    {children}
  </p>
);
export const Status = ({ children, error = false }) =>
  children ? (
    <p
      role={error ? "alert" : "status"}
      className={cn(
        "text-xs leading-relaxed",
        error ? "text-rose-600" : "text-teal-700",
      )}
    >
      {children}
    </p>
  ) : null;
export const IconBadge = ({ children, className }) => (
  <Badge variant="secondary" className={cn("gap-1 font-medium", className)}>
    {children}
  </Badge>
);
export const busyIcon = <LoaderCircle className="animate-spin" />;
