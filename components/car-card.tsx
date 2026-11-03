import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Car, Users, Fuel, Gauge } from "lucide-react";

interface CarCardProps {
  brand: string;
  model: string;
  year: number;
  type: string;
  seats: number;
  transmission: string;
  fuelType: string;
  dailyRate: number;
  image: string;
  mode?: "self_drive" | "with_driver";
}

export function CarCard({
  brand,
  model,
  year,
  type,
  seats,
  transmission,
  fuelType,
  dailyRate,
  image,
  mode = "self_drive",
}: CarCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow border-2">
      <div className="relative aspect-video bg-muted">
        <img
          src={image}
          alt={`${brand} ${model}`}
          className="object-cover w-full h-full"
        />
        <Badge className="absolute top-3 right-3 bg-primary">
          {mode === "self_drive" ? "Self-drive" : "With driver"}
        </Badge>
      </div>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-semibold text-lg">
              {brand} {model}
            </h3>
            <p className="text-sm text-muted-foreground">
              {year} • {type}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">₱{dailyRate}</p>
            <p className="text-xs text-muted-foreground">per day</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>{seats} seats</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Car className="h-4 w-4" />
            <span>{transmission}</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Fuel className="h-4 w-4" />
            <span>{fuelType}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="w-full">
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
}
