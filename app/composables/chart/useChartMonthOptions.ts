export const useUseChartMonthOptions = (months: number) => {
  const generateMonths = (months: number) => {
    const categories = [];
    const currentDate = new Date();
    
    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(currentDate.getMonth() - i);
      categories.push(
        date.toLocaleString('default', { month: 'short' })
      );
    }
    
    return categories; // 例如 ["Mar","Apr","May"...]
  };

  return reactive({
    chart: {
        type: 'bar',
        height: 210,
        stacked: true
    },
    plotOptions: {
        bar: {
            horizontal: false,
            columnWidth: '25%',
            endingShape: 'rounded',
        },
    },
    grid: {
        borderColor: '#f2f5f7',
    },
    dataLabels: {
        enabled: false
    },
    legend: {
        markers: {
            strokeWidth: 0,
        },
    
    },
    colors: ["#845adf", "#28d193", "#ffbe14", "#23b7e5"],
    stroke: {
        show: true,
        colors: ['transparent']
    },
    xaxis: {
        categories: generateMonths(months),
        labels: {
            show: true,
            style: {
                colors: "#8c9097",
                fontSize: '11px',
                fontWeight: 600,
                cssClass: 'apexcharts-xaxis-label',
            },
        }
    },
    yaxis: {
        title: {
            style: {
                color: "#8c9097",
            }
        },
        labels: {
            show: true,
            style: {
                colors: "#8c9097",
                fontSize: '11px',
                fontWeight: 600,
                cssClass: 'apexcharts-xaxis-label',
            },
        }
    },
    fill: {
        opacity: 1
    },
    });


}
